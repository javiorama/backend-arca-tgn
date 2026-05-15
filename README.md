# Backend ARCA - TG Norte

Backend Node.js para integración con ARCA/AFIP.

## Variables de entorno (configurar en Railway)

```
AFIP_CUIT=30708976969
AFIP_PUNTO_VENTA=1
AFIP_PRODUCTION=true
AFIP_CERT_BASE64=<certificado .crt en base64>
AFIP_KEY_BASE64=<clave .key en base64>
PORT=3001
```

## Cómo convertir el certificado a base64

En Mac/Linux:
```bash
base64 -i certificado.crt | tr -d '\n'
base64 -i clave.key | tr -d '\n'
```

En Windows (PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("certificado.crt"))
[Convert]::ToBase64String([IO.File]::ReadAllBytes("clave.key"))
```

## Endpoints

- `GET /health` - Estado del servidor
- `GET /ultimo-remito` - Último número de remito emitido
- `POST /generar-remito` - Genera remito con CAI

## Tipo de comprobante

Remito X = Tipo 91 en AFIP/ARCA
