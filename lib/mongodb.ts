import 'server-only'

import { MongoClient, type Db } from 'mongodb'

declare global {
  var parkGateMongoClientPromise: Promise<MongoClient> | undefined
}

export async function getParkingDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI no está configurado.')

  globalThis.parkGateMongoClientPromise ??= new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    maxIdleTimeMS: 60_000,
  }).connect()

  try {
    const client = await globalThis.parkGateMongoClientPromise
    return client.db('smart_parking_db')
  } catch (error) {
    globalThis.parkGateMongoClientPromise = undefined
    throw error
  }
}
