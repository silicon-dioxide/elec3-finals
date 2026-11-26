import { randomBytes } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME || 'Ratings'
const localEndpoint = process.env.DYNAMODB_ENDPOINT
const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(localEndpoint ? {
    endpoint: localEndpoint,
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  } : {}),
}))

const EXHIBIT_ID_PATTERN = /^(0[1-9]|1[0-9]|2[0-5])$/

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function parseBody(event) {
  if (typeof event.body !== 'string') throw new Error('Malformed JSON body')
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  try {
    return JSON.parse(bodyText)
  } catch {
    throw new Error('Malformed JSON body')
  }
}

async function addRating(event) {
  let input
  try {
    input = parseBody(event)
  } catch (error) {
    return response(400, { error: error.message })
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return response(400, { error: 'Body must be a JSON object' })
  }
  if (typeof input.exhibitId !== 'string' || !EXHIBIT_ID_PATTERN.test(input.exhibitId)) {
    return response(400, { error: 'Invalid exhibitId' })
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return response(400, { error: 'Invalid rating' })
  }

  const createdAt = new Date().toISOString()
  const ratingId = `${createdAt}#${randomBytes(4).toString('hex')}`

  await client.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: { exhibitId: input.exhibitId, ratingId, rating: input.rating, createdAt },
  }))

  return response(201, { exhibitId: input.exhibitId, ratingId })
}

async function getRatingSummary(event) {
  const exhibitId = event.pathParameters?.id
  if (typeof exhibitId !== 'string' || !EXHIBIT_ID_PATTERN.test(exhibitId)) {
    return response(400, { error: 'Invalid exhibitId' })
  }

  let count = 0
  let total = 0
  let lastEvaluatedKey

  do {
    const result = await client.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: '#exhibitId = :exhibitId',
      ExpressionAttributeNames: { '#exhibitId': 'exhibitId', '#rating': 'rating' },
      ExpressionAttributeValues: { ':exhibitId': exhibitId },
      ProjectionExpression: '#rating',
      ...(lastEvaluatedKey ? { ExclusiveStartKey: lastEvaluatedKey } : {}),
    }))
    for (const item of result.Items ?? []) {
      count += 1
      total += item.rating
    }
    lastEvaluatedKey = result.LastEvaluatedKey
  } while (lastEvaluatedKey)

  const average = count === 0 ? null : Math.round((total / count) * 100) / 100
  return response(200, { exhibitId, count, average })
}

export const handler = async (event) => {
  try {
    if (event.routeKey === 'POST /ratings') return await addRating(event)
    if (event.routeKey === 'GET /exhibits/{id}/ratings') return await getRatingSummary(event)
    return response(404, { error: 'Route not found' })
  } catch (error) {
    console.error(error)
    return response(500, { error: 'Internal server error' })
  }
}
