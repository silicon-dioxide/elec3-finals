import dynalite from 'dynalite'
import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

const endpoint = process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000'
const port = Number(new URL(endpoint).port || 8000)
const localClient = new DynamoDBClient({
  endpoint,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

export const documentClient = DynamoDBDocumentClient.from(localClient)

const database = dynalite({ createTableMs: 0 })

export async function start() {
  if (!database.listening) {
    await new Promise((resolve, reject) => {
      const fail = (error) => reject(error)
      database.once('error', fail)
      database.listen(port, () => {
        database.removeListener('error', fail)
        resolve()
      })
    })
  }

  try {
    await localClient.send(new CreateTableCommand({
      TableName: process.env.TABLE_NAME || 'Ratings',
      AttributeDefinitions: [
        { AttributeName: 'exhibitId', AttributeType: 'S' },
        { AttributeName: 'ratingId', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'exhibitId', KeyType: 'HASH' },
        { AttributeName: 'ratingId', KeyType: 'RANGE' },
      ],
      BillingMode: 'PAY_PER_REQUEST',
    }))
  } catch (error) {
    if (error.name !== 'ResourceInUseException') throw error
  }

  return database
}

export async function stop() {
  if (!database.listening) return
  await new Promise((resolve, reject) => {
    database.close((error) => error ? reject(error) : resolve())
  })
}
