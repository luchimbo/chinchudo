# Plan de Implementación: Avatar IA Local y Gratis (RTX 4060 + Edge-TTS + FFmpeg/Wav2Lip)

Este plan detalla cómo utilizaremos tu placa de video **NVIDIA GeForce RTX 4060** para renderizar los videos comerciales con presentadores humanos de forma **100% local y gratuita** (sin consumir créditos de D-ID ni requerir suscripciones de HeyGen).

---

## 🏗️ Arquitectura del Sistema Local

1.  **Motor de Audio (Edge-TTS):**
    Utilizaremos la biblioteca gratuita `edge-tts` para convertir el guion en un archivo de audio de alta fidelidad. Esta biblioteca usa las mismas voces neuronales de Microsoft Azure sin costo ni API Keys (soporta voces en español de Argentina, México, España, etc.).
2.  **Motor de Sincronización (Lip-Sync local):**
    Crearemos un script en Python (`agents/render-avatar-local.py`) con dos modos de funcionamiento:
    *   **Modo Rápido / Fallback:** Une el audio generado con un video de plantilla del presentador seleccionado utilizando un bucle de FFmpeg (`-stream_loop -1`). Esto funciona de inmediato sin instalar modelos pesados.
    *   **Modo IA (Wav2Lip + CUDA):** Al descargar el modelo Wav2Lip en local, el script procesa el video con PyTorch usando la GPU RTX 4060, logrando una sincronización labial realista.
3.  **Composición Final:**
    Una vez generado el video del presentador localmente, el compositor FFmpeg ya desarrollado (`src/lib/ffmpeg-composer.ts`) realiza el ensamble de las 3 imágenes del producto y la música de fondo.

---

## 📦 Prerrequisitos en el Sistema (Python)

Debemos instalar la biblioteca de voz en tu entorno Python. Proponemos ejecutar:
```bash
pip install edge-tts
```
*Para habilitar el lip-sync de IA local más adelante, se requerirá instalar PyTorch con CUDA:*
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

---

## 📝 Archivos a Crear / Modificar

### 1. Backend / Servidor

#### [NEW] [render-avatar-local.py](file:///d:/pcmidi-suite/agents/render-avatar-local.py)
*   Script de Python para ser invocado desde Next.js.
*   Genera el audio a partir del guion de texto usando `edge-tts`.
*   Resuelve la plantilla de video del avatar (ej: hombre o mujer parpadeando/sonriendo).
*   Genera el video sincronizado con FFmpeg (o Wav2Lip en GPU si está disponible) y lo exporta a la ruta indicada.

#### [MODIFY] [route.ts](file:///d:/pcmidi-suite/src/app/api/videos/route.ts)
*   Reemplazar las llamadas de la API de D-ID en la acción `render` e invocar el proceso local de Python mediante `child_process.spawn`:
    ```bash
    python agents/render-avatar-local.py --text "guion" --voice "es-AR-TomasNeural" --output "public/videos/temp.mp4"
    ```
*   Actualizar la consulta de estado asíncrona (`action=status`) para que espere que termine el proceso de Python y luego gatille la composición del video final de FFmpeg.

---

### 2. Frontend / Interfaz

#### [MODIFY] [VideosClient.tsx](file:///d:/pcmidi-suite/src/app/(app)/videos/VideosClient.tsx)
*   Actualizar las etiquetas de estado a *"Renderizando en GPU Local..."* en lugar de *"D-ID"*.

---

## 📈 Plan de Verificación

1.  **Prueba de Voz Local:**
    Ejecutar el script de forma directa desde la consola para comprobar la creación del audio de Tomas/Elena.
2.  **Prueba de Composición:**
    Crear un guion desde el panel y presionar *"Renderizar Video Local"*. Comprobar que el video resultante aparezca en la galería con la voz sintetizada y el presentador en loop.
