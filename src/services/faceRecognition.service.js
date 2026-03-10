// Cargar TensorFlow.js puro (sin binarios nativos) antes que face-api
// Esto evita que @vladmandic/face-api intente cargar @tensorflow/tfjs-node
import '@tensorflow/tfjs-backend-cpu';
import * as tf from '@tensorflow/tfjs';

import * as faceapi from '@vladmandic/face-api';
import { Canvas, Image, ImageData } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

// Patch Node.js environment for face-api.js
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajusta el path hacia donde hayas copiado la carpeta "models" del Desktop
const MODELS_DIR = path.join(__dirname, '../../public/models');

let modelsLoaded = false;

export async function loadModels() {
    if (modelsLoaded) return;
    try {
        console.log('[FaceAPI] Inicializando backend CPU...');
        await tf.setBackend('cpu');
        await tf.ready();
        console.log('[FaceAPI] Cargando modelos...');
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_DIR),
            faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_DIR),
            faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_DIR),
        ]);
        modelsLoaded = true;
        console.log('[FaceAPI] Modelos cargados correctamente ✅');
    } catch (error) {
        console.error('[FaceAPI] Error cargando modelos:', error);
        throw new Error('No se pudieron cargar los modelos de Face API');
    }
}

/**
 * Convierte un buffer de imagen a un tensor de face-api y extrae su descriptor (128 floats).
 * @param {Buffer} imageBuffer - Buffer de la imagen.
 * @returns {Promise<Float32Array|null>}
 */
export async function extractDescriptorFromImage(imageBuffer) {
    if (!modelsLoaded) {
        await loadModels();
    }

    const img = new Image();
    img.src = imageBuffer;

    const detections = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detections) {
        return null; // Rostro no detectado en la imagen
    }

    return detections.descriptor; // Retorna Float32Array
}
