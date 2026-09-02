# Neon Music

Reproductor de música local para Android/iOS construido con Expo + React Native.

## Funciones incluidas

- Reproducir / pausar.
- Canción anterior / siguiente.
- Repetir la canción actual desde cero.
- Reproducción aleatoria.
- Importación múltiple de canciones desde el selector de archivos del teléfono.
- Copia de las canciones al almacenamiento privado de la app para conservarlas después de cerrar la app.
- Avance y retroceso en la barra de progreso.
- Reproducción en segundo plano.
- Controles de reproducción en pantalla bloqueada / notificación.
- Compatible con los botones laterales de volumen del teléfono mediante el volumen multimedia del sistema.
- Eliminación de canciones de la biblioteca manteniendo pulsada una canción.
- Diseño oscuro estilo neón.

## Requisitos

- Node.js 22.13.x o superior para Expo SDK 57.
- Android Studio + SDK Android para generar Android.
- Para iOS: macOS + Xcode.

## Instalación

```bash
npm install
npx expo start
```

Para generar y ejecutar el proyecto Android nativo:

```bash
npx expo run:android
```

También puedes usar un development build. Para las funciones de audio en segundo plano y pantalla bloqueada se recomienda probar una compilación nativa de la aplicación.

## Nota sobre la importación

La app utiliza el selector de archivos del sistema. Puedes entrar a una carpeta del teléfono y seleccionar una o varias canciones. Las canciones se copian al almacenamiento privado de Neon Music.

## Nota sobre reproducción con pantalla bloqueada

`expo-audio` está configurado con `enableBackgroundPlayback: true`, `shouldPlayInBackground: true` y controles de pantalla bloqueada. En Android, la app solicita permiso de notificaciones cuando comienza a reproducir, porque el sistema utiliza una notificación de control multimedia para mantener el servicio de reproducción activo.

## Controles de volumen

No se captura el botón físico de volumen dentro de la aplicación. Android/iOS mantienen esos botones bajo control del sistema y ajustan el volumen multimedia de la reproducción, que es el comportamiento esperado para un reproductor de música.
