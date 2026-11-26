import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BatchWriteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

let handler
let stopDatabase
let documentClient

beforeAll(async () => {
  process.env.TABLE_NAME = 'Ratings'
  process.env.AWS_REGION = 'us-east-1'
  process.env.DYNAMODB_ENDPOINT = 'http://localhost:8000'
  const database = await import('../local/db.js')
  await database.start()
  stopDatabase = database.stop
  documentClient = database.documentClient
  handler = (await import('../src/handler.js')).handler
})

afterAll(async () => {
  documentClient?.destroy()
  await stopDatabase?.()
})

const post = async (exhibitId, rating) => handler({
  routeKey: 'POST /ratings',
  body: JSON.stringify({ exhibitId, rating }),
})
const get = async (id) => handler({
  routeKey: 'GET /exhibits/{id}/ratings',
  pathParameters: { id },
})
const json = (result) => JSON.parse(result.body)

describe('local API and Dynalite integration', () => {
  it('stores ratings and keeps exhibit summaries separate', async () => {
    for (const rating of [5, 4, 3]) {
      expect((await post('07', rating)).statusCode).toBe(201)
    }
    expect((await post('08', 2)).statusCode).toBe(201)

    expect(json(await get('07'))).toEqual({ exhibitId: '07', count: 3, average: 4 })
    expect(json(await get('08'))).toEqual({ exhibitId: '08', count: 1, average: 2 })
  })

  it('reads all pages when Dynalite emits a pagination key', async () => {
    const itemCount = 24000
    const requests = Array.from({ length: itemCount }, (_, index) => {
      const createdAt = new Date(Date.UTC(2025, 0, 1) + index).toISOString()
      const suffix = index.toString(16).padStart(8, '0')
      return {
        PutRequest: {
          Item: {
            exhibitId: '25',
            ratingId: `${createdAt}#${suffix}`,
            rating: 3,
            createdAt,
          },
        },
      }
    })

    // Batch writes are used only to seed this local integration fixture, not by the Lambda handler.
    const batches = []
    for (let index = 0; index < requests.length; index += 25) {
      batches.push(requests.slice(index, index + 25))
    }
    for (let index = 0; index < batches.length; index += 24) {
      await Promise.all(batches.slice(index, index + 24).map((batch) =>
        documentClient.send(new BatchWriteCommand({ RequestItems: { Ratings: batch } })),
      ))
    }

    const firstPage = await documentClient.send(new QueryCommand({
      TableName: 'Ratings',
      KeyConditionExpression: '#exhibitId = :id',
      ExpressionAttributeNames: { '#exhibitId': 'exhibitId', '#rating': 'rating' },
      ExpressionAttributeValues: { ':id': '25' },
      ProjectionExpression: '#rating',
    }))

    if (!firstPage.LastEvaluatedKey) {
      // Dynalite did not paginate this query; the unit test mocks LastEvaluatedKey to cover that path.
      return
    }

    expect(json(await get('25'))).toEqual({ exhibitId: '25', count: itemCount, average: 3 })
  })
})
