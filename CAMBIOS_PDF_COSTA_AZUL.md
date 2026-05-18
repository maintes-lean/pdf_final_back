# Cambios PDF Costa Azul

Esta versión modifica `controllers/pdf.controller.js` para generar cotizaciones con una estructura visual similar al modelo real usado por Costa Azul:

- Encabezado con logo/imagen de portada del perfil PDF.
- Título principal: COTIZACIÓN DE SERVICIOS.
- Destino y mes/año.
- Mensaje introductorio al cliente.
- Servicios separados por líneas punteadas.
- Tipografía mixta: Helvetica para encabezado/texto general y Courier para bloques operativos.
- Líneas de confirmación destacadas en rojo cuando aparecen palabras como confirmado, emitido o reconfirmado.
- Condiciones de cancelación destacadas con fondo amarillo.
- PDF sin precios: oculta importes y totales.
- PDF con precios: muestra tarifa por servicio y total final resaltado.
- Se eliminan del PDF los campos visualmente quitados: estado/notas de viaje, servicio/notas de vouchers, condiciones comerciales y condición legal.
