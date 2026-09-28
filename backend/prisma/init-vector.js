// Script to enable pgvector extension and ensure vector embedding columns exist
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function initVector() {
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    await prisma.$executeRawUnsafe('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);');
    await prisma.$executeRawUnsafe('ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);');
    console.log('✅ pgvector extension and vector columns successfully initialized!');
  } catch (err) {
    console.error('Vector setup warning:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

initVector();
