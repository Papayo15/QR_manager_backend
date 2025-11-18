import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { google } from 'googleapis';
import { Readable } from 'stream';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI;

// Google Drive Configuration
const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.OAUTH_REFRESH_TOKEN;
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Variables globales
let db;
let mongoClient;
let driveClient;

// ============================================
// CONFIGURACIÓN DE GOOGLE DRIVE
// ============================================

function initializeDriveClient() {
  try {
    if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
      console.warn('⚠️ Credenciales de Google Drive no configuradas');
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
    );

    oauth2Client.setCredentials({
      refresh_token: OAUTH_REFRESH_TOKEN
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('✅ Cliente de Google Drive inicializado');
    return drive;
  } catch (error) {
    console.error('❌ Error inicializando Google Drive:', error.message);
    return null;
  }
}

// ============================================
// FUNCIÓN: Subir foto a Google Drive
// ============================================

async function uploadPhotoToDrive(photoBase64, fileName, metadata = {}) {
  if (!driveClient) {
    throw new Error('Cliente de Google Drive no disponible');
  }

  if (!DRIVE_FOLDER_ID) {
    throw new Error('DRIVE_FOLDER_ID no configurado');
  }

  try {
    const buffer = Buffer.from(photoBase64, 'base64');
    const stream = Readable.from(buffer);

    const fileMetadata = {
      name: fileName,
      parents: [DRIVE_FOLDER_ID],
      description: JSON.stringify(metadata)
    };

    const media = {
      mimeType: 'image/jpeg',
      body: stream
    };

    const response = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink'
    });

    console.log(`📤 Foto subida a Drive - ID: ${response.data.id} - Nombre: ${fileName}`);

    return {
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink
    };
  } catch (error) {
    console.error('❌ Error subiendo foto a Drive:', error.message);
    throw error;
  }
}
