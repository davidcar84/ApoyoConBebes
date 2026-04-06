# ApoyoConBebes

Aplicación para coordinar turnos de apoyo con bebés gemelos usando Firebase Realtime Database y PWA.

## Estructura
- `padres.html` - vista para papás/admin
- `colaborador.html` - vista para colaboradores con `?id={codigo}`
- `config.json` - configuración local de horarios, categorías y PIN de acceso
- `firebase.js` - helper directo a Firebase REST API
- `service-worker.js` - caché de assets e instalación PWA
- `app.css` - estilos comunes
- `icons/` - iconos PWA

## Cómo usar
1. Abrir `padres.html`.
2. Introducir el PIN definido en `config.json` (`2026` por defecto).
3. Crear actividades y colaboradores.
4. Crear bloques en la semana actual.
5. Compartir el link del colaborador con `colaborador.html?id={codigo}`.

## Deploy
Subir los archivos a GitHub Pages en el repositorio `ApoyoConBebes`.

> Nota: los datos se sincronizan a través de Firebase Realtime Database usando la URL `https://apoyoconbebes-default-rtdb.firebaseio.com/`.
