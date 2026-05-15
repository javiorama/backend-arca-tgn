const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'https://remitos-tgn.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ]
}));
app.use(express.json());

// Health check - siempre responde
app.get('/health', (req, res) => {
  const tieneCert = !!(process.env.AFIP_CERT_BASE64 && process.env.AFIP_KEY_BASE64);
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    certificado: tieneCert ? 'configurado' : 'pendiente',
    cuit: process.env.AFIP_CUIT || 'no configurado',
    produccion: process.env.AFIP_PRODUCTION === 'true'
  });
});

// Verificar si el certificado está configurado
const verificarCertificado = () => {
  if (!process.env.AFIP_CERT_BASE64 || !process.env.AFIP_KEY_BASE64) {
    throw new Error('Certificado ARCA no configurado. Cargá AFIP_CERT_BASE64 y AFIP_KEY_BASE64 en las variables de entorno.');
  }
};

// Inicializar AFIP/ARCA
const getAfipInstance = () => {
  verificarCertificado();

  const Afip = require('@afipsdk/afip.js');

  const cert = Buffer.from(process.env.AFIP_CERT_BASE64, 'base64').toString('utf8');
  const key = Buffer.from(process.env.AFIP_KEY_BASE64, 'base64').toString('utf8');

  const certPath = '/tmp/afip_cert.pem';
  const keyPath = '/tmp/afip_key.pem';
  fs.writeFileSync(certPath, cert);
  fs.writeFileSync(keyPath, key);

  return new Afip({
    CUIT: process.env.AFIP_CUIT || '30708976969',
    cert: certPath,
    key: keyPath,
    production: process.env.AFIP_PRODUCTION === 'true',
    res_folder: '/tmp',
    ta_folder: '/tmp'
  });
};

// GET /ultimo-remito
app.get('/ultimo-remito', async (req, res) => {
  try {
    const afip = getAfipInstance();
    const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1');
    const ultimoNumero = await afip.ElectronicBilling.getLastVoucher(puntoVenta, 91);
    res.json({ success: true, ultimoNumero, proximoNumero: ultimoNumero + 1 });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /generar-remito
app.post('/generar-remito', async (req, res) => {
  try {
    const { cliente, orden, producto } = req.body;

    if (!cliente || !orden) {
      return res.status(400).json({ success: false, error: 'Faltan datos: cliente y orden son requeridos' });
    }

    const afip = getAfipInstance();
    const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1');

    const ultimoNumero = await afip.ElectronicBilling.getLastVoucher(puntoVenta, 91);
    const nuevoNumero = ultimoNumero + 1;

    const hoy = new Date();
    const fechaAFIP = parseInt(
      hoy.getFullYear().toString() +
      String(hoy.getMonth() + 1).padStart(2, '0') +
      String(hoy.getDate()).padStart(2, '0')
    );

    const datosComprobante = {
      CantReg: 1,
      PtoVta: puntoVenta,
      CbteTipo: 91,
      Concepto: 1,
      DocTipo: 99,
      DocNro: 0,
      CbteDesde: nuevoNumero,
      CbteHasta: nuevoNumero,
      CbteFch: fechaAFIP,
      ImpTotal: 0,
      ImpTotConc: 0,
      ImpNeto: 0,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: 'PES',
      MonCotiz: 1,
    };

    const resultado = await afip.ElectronicBilling.createVoucher(datosComprobante);

    res.json({
      success: true,
      numero: nuevoNumero,
      puntoVenta,
      cae: resultado.CAE,
      caeFechaVto: resultado.CAEFchVto,
      fecha: hoy.toLocaleDateString('es-AR'),
      cliente,
      orden,
      producto,
    });

  } catch (error) {
    console.error('Error generando remito:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend ARCA TGN corriendo en puerto ${PORT}`);
  console.log(`Modo: ${process.env.AFIP_PRODUCTION === 'true' ? 'PRODUCCION' : 'HOMOLOGACION'}`);
  console.log(`Certificado: ${process.env.AFIP_CERT_BASE64 ? 'configurado' : 'PENDIENTE'}`);
});
