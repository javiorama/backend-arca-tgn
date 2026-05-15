const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Afip = require('afip.js');
const fs = require('fs');
const path = require('path');

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Inicializar AFIP/ARCA
const getAfipInstance = () => {
  // El certificado y clave se leen de variables de entorno (base64)
  const cert = Buffer.from(process.env.AFIP_CERT_BASE64 || '', 'base64').toString('utf8');
  const key = Buffer.from(process.env.AFIP_KEY_BASE64 || '', 'base64').toString('utf8');

  // Guardar temporalmente en disco (requerido por afip.js)
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

// GET /ultimo-remito - obtener último número de remito
app.get('/ultimo-remito', async (req, res) => {
  try {
    const afip = getAfipInstance();
    const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1');

    // Tipo 91 = Remito X
    const ultimoNumero = await afip.ElectronicBilling.getLastVoucher(puntoVenta, 91);

    res.json({
      success: true,
      ultimoNumero,
      proximoNumero: ultimoNumero + 1
    });
  } catch (error) {
    console.error('Error obteniendo último remito:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /generar-remito - generar remito con CAI
app.post('/generar-remito', async (req, res) => {
  try {
    const {
      cliente,
      representante,
      orden,
      producto,
      descripcion,
      fechaEntrega,
      direccion,
      cantidad
    } = req.body;

    if (!cliente || !orden) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: cliente y orden'
      });
    }

    const afip = getAfipInstance();
    const puntoVenta = parseInt(process.env.AFIP_PUNTO_VENTA || '1');

    // Obtener último número
    const ultimoNumero = await afip.ElectronicBilling.getLastVoucher(puntoVenta, 91);
    const nuevoNumero = ultimoNumero + 1;

    // Fecha en formato YYYYMMDD
    const hoy = new Date();
    const fechaAFIP = parseInt(
      hoy.getFullYear().toString() +
      String(hoy.getMonth() + 1).padStart(2, '0') +
      String(hoy.getDate()).padStart(2, '0')
    );

    // Datos del comprobante - Remito X (tipo 91)
    const datosComprobante = {
      CantReg: 1,           // Cantidad de comprobantes
      PtoVta: puntoVenta,   // Punto de venta
      CbteTipo: 91,         // Tipo 91 = Remito X
      Concepto: 1,          // 1 = Productos
      DocTipo: 99,          // 99 = Consumidor final / sin CUIT
      DocNro: 0,
      CbteDesde: nuevoNumero,
      CbteHasta: nuevoNumero,
      CbteFch: fechaAFIP,
      ImpTotal: 0,          // Remito no tiene importe
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
    console.error('Error generando remito ARCA:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend ARCA TGN corriendo en puerto ${PORT}`);
  console.log(`Modo: ${process.env.AFIP_PRODUCTION === 'true' ? 'PRODUCCIÓN' : 'HOMOLOGACIÓN'}`);
});
