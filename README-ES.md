# Papus Chat — paquete para generar instaladores

La dirección de la web ya está configurada:
`https://papus-chat.onrender.com/`

Este paquete NO modifica los archivos originales de la web. Es una aplicación envoltorio que abre la web publicada.

## Cómo generar el EXE y el APK con GitHub Actions

1. Descarga y descomprime este ZIP.
2. En GitHub, abre tu repositorio `Electronico118/papus-chat`.
3. Sube las carpetas `desktop`, `android`, `.github` y el archivo `README-ES.md` a la raíz del repositorio. Si GitHub pregunta si debe reemplazar archivos existentes, **no reemplaces** `index.html`, `server.js` ni `package.json` de la web; solo añade estas carpetas y `.github/workflows/build-apps.yml`.
4. Ve a la pestaña **Actions** del repositorio.
5. Abre **Build Papus Chat apps** y pulsa **Run workflow** (o espera a que termine el flujo tras subir los archivos).
6. Cuando termine, entra en la ejecución y descarga los artefactos:
   - `Papus-Chat-Windows-Setup` contiene el instalador `.exe`.
   - `Papus-Chat-Android-APK` contiene el `.apk`.

## Importante
- Este paquete no contiene los ejecutables todavía: GitHub Actions los compila al ejecutarse.
- La web debe funcionar públicamente y permitir Socket.IO/WebSocket y WebRTC para que chat y llamadas funcionen dentro de las apps.
- El APK de depuración es para pruebas/instalación directa; no es un APK firmado para publicar en Google Play.
- Las funciones del navegador como cámara, micrófono, pantalla compartida y notificaciones pueden necesitar permisos e integración nativa y deben probarse en los dispositivos.
- No copies estos archivos encima de los archivos de la web; añade solo las carpetas indicadas.
