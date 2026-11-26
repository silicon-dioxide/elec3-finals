import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

process.env.AWS_REGION = 'us-east-1'
const dynamoMock = mockClient(DynamoDBDocumentClient)
const { handler } = await import('../src/handler.js')

const post = (body) => ({ routeKey: 'POST /ratings', body: JSON.stringify(body) })
const get = (id) => ({ routeKey: 'GET /exhibits/{id}/ratings', pathParameters: { id } })
const json = (result) => JSON.parse(result.body)

beforeEach(() => dynamoMock.reset())

describe('POST /ratings', () => {
  it('stores one valid rating and returns its identifier', async () => {
    dynamoMock.on(PutCommand).resolves({})

    const result = await handler(post({ exhibitId: '07', rating: 4 }))
    const calls = dynamoMock.commandCalls(PutCommand)
    const item = calls[0].args[0].input.Item

    expect(result.statusCode).toBe(201)
    expect(result.headers['Content-Type']).toBe('application/json')
    expect(json(result)).toEqual({ exhibitId: '07', ratingId: item.ratingId })
    expect(calls).toHaveLength(1)
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'exhibitId', 'rating', 'ratingId'])
    expect(item).toMatchObject({ exhibitId: '07', rating: 4 })
    expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt)
    expect(item.ratingId).toMatch(new RegExp(`^${item.createdAt}#[0-9a-f]{8}$`))
  })

  it.each([
    ['rating 0', { exhibitId: '07', rating: 0 }],
    ['rating 6', { exhibitId: '07', rating: 6 }],
    ['decimal rating', { exhibitId: '07', rating: 3.5 }],
    ['string rating', { exhibitId: '07', rating: '4' }],
    ['null rating', { exhibitId: '07', rating: null }],
    ['missing rating', { exhibitId: '07' }],
    ['missing exhibit ID', { rating: 3 }],
    ['exhibit ID 26', { exhibitId: '26', rating: 3 }],
    ['exhibit ID 00', { exhibitId: '00', rating: 3 }],
    ['unpadded exhibit ID', { exhibitId: '7', rating: 3 }],
  ])('rejects %s without sending a command', async (_name, body) => {
    const result = await handler(post(body))
    expect(result.statusCode).toBe(400)
    expect(json(result).error).toEqual(expect.any(String))
    expect(dynamoMock.calls()).toHaveLength(0)
  })

  it('rejects malformed JSON', async () => {
    const result = await handler({ routeKey: 'POST /ratings', body: '{bad json' })
    expect(result.statusCode).toBe(400)
    expect(json(result).error).toMatch(/json/i)
    expect(dynamoMock.calls()).toHaveLength(0)
  })
})

describe('GET /exhibits/{id}/ratings', () => {
  it('returns null average when there are no ratings', async () => {
    dynamoMock.on(QueryCommand).resolves({ Items: [] })
    const result = await handler(get('07'))
    expect(result.statusCode).toBe(200)
    expect(json(result)).toEqual({ exhibitId: '07', count: 0, average: null })
  })

  it('reads every query page before calculating the average', async () => {
    dynamoMock.on(QueryCommand)
      .resolvesOnce({ Items: [{ rating: 5 }], LastEvaluatedKey: { exhibitId: '07', ratingId: 'next' } })
      .resolvesOnce({ Items: [{ rating: 3 }] })

    const result = await handler(get('07'))
    const calls = dynamoMock.commandCalls(QueryCommand)
    expect(json(result)).toEqual({ exhibitId: '07', count: 2, average: 4 })
    expect(calls).toHaveLength(2)
    expect(calls[0].args[0].input.ProjectionExpression).toBe('#rating')
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual({ exhibitId: '07', ratingId: 'next' })
  })

  it('rejects an invalid exhibit ID without querying', async () => {
    const result = await handler(get('7'))
    expect(result.statusCode).toBe(400)
    expect(dynamoMock.calls()).toHaveLength(0)
  })
})

it('returns a generic 500 and logs unexpected DynamoDB errors', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  dynamoMock.on(PutCommand).rejects(new Error('sensitive database detail'))

  const result = await handler(post({ exhibitId: '07', rating: 5 }))
  expect(result.statusCode).toBe(500)
  expect(json(result)).toEqual({ error: 'Internal server error' })
  expect(result.body).not.toContain('sensitive database detail')
  expect(log).toHaveBeenCalledOnce()
  log.mockRestore()
})

it('sends only PutCommand and QueryCommand from the handler', async () => {
  dynamoMock.on(PutCommand).resolves({})
  dynamoMock.on(QueryCommand).resolves({ Items: [] })

  await handler(post({ exhibitId: '07', rating: 5 }))
  await handler(get('07'))

  const sentCommands = dynamoMock.calls().map((call) => call.args[0].constructor)
  expect(sentCommands).toHaveLength(2)
  expect(sentCommands.every((command) => [PutCommand, QueryCommand].includes(command))).toBe(true)
})

it('returns 404 for an unknown route', async () => {
  const result = await handler({ routeKey: 'GET /unknown' })
  expect(result.statusCode).toBe(404)
})
