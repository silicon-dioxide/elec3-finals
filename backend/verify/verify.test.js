import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

process.env.TABLE_NAME = 'Ratings'
process.env.AWS_REGION = 'us-east-1'
process.env.DYNAMODB_ENDPOINT = 'http://localhost:18008'
const db = await import('../local/db.js')
await db.start()
const { handler } = await import('../src/handler.js')
const post = (body) => ({ routeKey: 'POST /ratings', body: JSON.stringify(body) })
const get = (id) => ({ routeKey: 'GET /exhibits/{id}/ratings', pathParameters: { id } })
const body = (r) => JSON.parse(r.body)
const query = async (id) => db.documentClient.send(new QueryCommand({
  TableName: 'Ratings', KeyConditionExpression: '#e = :e',
  ExpressionAttributeNames: { '#e': 'exhibitId' }, ExpressionAttributeValues: { ':e': id },
}))
const add = async (id, rating) => handler(post({ exhibitId: id, rating }))

afterAll(async () => { db.documentClient.destroy(); await db.stop() })

describe('Local backend validation', () => {
  it('V1 valid rating stored', async () => {
    const response = await add('07', 4)
    const item = (await query('07')).Items[0]
    expect(response.statusCode).toBe(201)
    expect(body(response)).toMatchObject({ exhibitId: '07', ratingId: item.ratingId })
    expect(item).toMatchObject({ exhibitId: '07', rating: 4 })
    expect(item.createdAt).toEqual(expect.any(String))
  })
  it('V2 ratings add and never overwrite', async () => {
    for (const n of [5, 4, 3]) expect((await add('07', n)).statusCode).toBe(201)
    expect(body(await handler(get('07')))).toMatchObject({ count: 4, average: 4 })
    expect((await query('07')).Items).toHaveLength(4)
  })
  it('V3 exhibits remain separate', async () => {
    await add('08', 2)
    expect(body(await handler(get('07')))).toMatchObject({ count: 4, average: 4 })
    expect(body(await handler(get('08')))).toMatchObject({ count: 1, average: 2 })
  })
  it('V4 invalid ratings do not write', async () => {
    const before = (await query('07')).Items.length
    for (const rating of [0, 6, 3.5, '4', null, true, undefined]) {
      const input = { exhibitId: '07' }; if (rating !== undefined) input.rating = rating
      expect((await handler(post(input))).statusCode).toBe(400)
    }
    expect((await query('07')).Items).toHaveLength(before)
  })
  it('V5 invalid exhibit IDs rejected for POST and GET', async () => {
    for (const id of ['26', '00', '7', '007', 'ab', '', undefined]) {
      expect((await add(id, 4)).statusCode).toBe(400)
      expect((await handler(get(id))).statusCode).toBe(400)
    }
    expect((await query('07')).Items).toHaveLength(4)
  })
  it('V6 malformed and missing bodies return 400', async () => {
    expect((await handler({ routeKey: 'POST /ratings', body: '{' })).statusCode).toBe(400)
    expect((await handler({ routeKey: 'POST /ratings' })).statusCode).toBe(400)
  })
  it('V7 empty exhibit has null average', async () => {
    expect(body(await handler(get('20')))).toEqual({ exhibitId: '20', count: 0, average: null })
  })
  it('V8 averages round to two decimals', async () => {
    for (const n of [5, 4, 4]) await add('09', n)
    for (const n of [5, 5, 4]) await add('10', n)
    expect(body(await handler(get('09'))).average).toBe(4.33)
    expect(body(await handler(get('10'))).average).toBe(4.67)
  })
  it('V9 unknown routes return 404', async () => {
    expect((await handler({ routeKey: 'GET /nothing' })).statusCode).toBe(404)
    expect((await handler({ routeKey: 'DELETE /ratings' })).statusCode).toBe(404)
  })
  it('V10 unexpected failure returns generic 500', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.DYNAMODB_ENDPOINT = 'http://127.0.0.1:1'
    vi.resetModules()
    const { handler: isolatedHandler } = await import('../src/handler.js')
    const response = await isolatedHandler(post({ exhibitId: '07', rating: 5 }))
    process.env.DYNAMODB_ENDPOINT = 'http://localhost:18008'
    log.mockRestore()
    expect(response.statusCode).toBe(500)
    expect(body(response).error).toBe('Internal server error')
    expect(response.body).not.toMatch(/stack|Ratings|localhost/i)
  })
  it('V11 Dynalite pagination covers padded items when it emits a key', async () => {
    const pads = await Promise.all(Array.from({ length: 6 }, (_, i) => db.documentClient.send(new PutCommand({
      TableName: 'Ratings', Item: { exhibitId: '12', ratingId: `pad-${i}`, rating: i < 3 ? 5 : 4, pad: 'x'.repeat(300_000) },
    }))))
    expect(pads).toHaveLength(6)
    const firstPage = await query('12')
    const querySpy = vi.spyOn(DynamoDBDocumentClient.prototype, 'send')
    const response = await handler(get('12'))
    const queryCalls = querySpy.mock.calls.filter(([command]) => command instanceof QueryCommand).length
    querySpy.mockRestore()
    console.log(`V11 Dynalite QueryCommand calls: ${queryCalls}`)
    if (!firstPage.LastEvaluatedKey) {
      console.warn('V11 NOT PROVABLE LOCALLY: Dynalite returned no LastEvaluatedKey for >1 MB padded items.')
      return
    }
    expect(queryCalls).toBeGreaterThan(1)
    expect(body(response)).toEqual({ exhibitId: '12', count: 6, average: 4.5 })
  })
})

describe('Mocked command and query validation', () => {
  let docMock
  beforeAll(() => { docMock = mockClient(DynamoDBDocumentClient) })
  afterAll(() => docMock.restore())
  it('V12 mock pagination follows keys and stops without one', async () => {
    docMock.reset()
    const key = { exhibitId: '13', ratingId: 'k1' }
    docMock.on(QueryCommand).resolvesOnce({ Items: [{ rating: 5 }], LastEvaluatedKey: key })
      .resolvesOnce({ Items: [{ rating: 3 }], LastEvaluatedKey: { exhibitId: '13', ratingId: 'k2' } })
      .resolvesOnce({ Items: [{ rating: 4 }] })
    expect(body(await handler(get('13')))).toEqual({ exhibitId: '13', count: 3, average: 4 })
    const calls = docMock.commandCalls(QueryCommand)
    expect(calls).toHaveLength(3)
    expect(calls[1].args[0].input.ExclusiveStartKey).toEqual(key)
  })
  it('V13 every query filters by exhibit and projects rating', async () => {
    docMock.reset(); docMock.on(QueryCommand).resolves({ Items: [] })
    await handler(get('14'))
    const input = docMock.commandCalls(QueryCommand)[0].args[0].input
    expect(input.KeyConditionExpression).toContain('exhibitId')
    expect(input.ProjectionExpression).toBe('#rating')
    expect(input.ExpressionAttributeNames['#rating']).toBe('rating')
  })
  it('V14 handler sends only PutCommand and QueryCommand', async () => {
    docMock.reset().on(PutCommand).resolves({}).on(QueryCommand).resolves({ Items: [] })
    await handler(post({ exhibitId: '15', rating: 4 })); await handler(get('15'))
    await handler({ routeKey: 'GET /other' })
    await handler({ routeKey: 'DELETE /ratings' })
    await handler(post({ exhibitId: 'bad', rating: 8 }))
    await handler({ routeKey: 'POST /ratings', body: '{' })
    await handler({ routeKey: 'POST /ratings' })
    await handler(get('7'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    docMock.on(PutCommand).rejects(new Error('expected mock failure'))
    await handler(post({ exhibitId: '15', rating: 4 }))
    docMock.on(QueryCommand).rejects(new Error('expected mock failure'))
    await handler(get('15'))
    log.mockRestore()
    expect(docMock.calls().every(c => [PutCommand, QueryCommand].includes(c.args[0].constructor))).toBe(true)
  })
  it('V19 every handler response has JSON status, body, and content type', async () => {
    docMock.reset().on(PutCommand).resolves({}).on(QueryCommand).resolves({ Items: [] })
    const responses = [await handler(post({ exhibitId: '16', rating: 3 })), await handler(get('16')), await handler({ routeKey: 'GET /unknown' }), await handler({ routeKey: 'POST /ratings', body: '{' })]
    for (const r of responses) { expect(r.statusCode).toEqual(expect.any(Number)); expect(r.headers['Content-Type']).toBe('application/json'); expect(() => JSON.parse(r.body)).not.toThrow() }
  })
})

async function sourceText(dir) {
  let text = ''
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name)
    if (entry.isDirectory()) text += await sourceText(file)
    else text += `\n${await readFile(file, 'utf8')}`
  }
  return text
}
const src = await sourceText(resolve('src'))
const handlerText = await readFile(resolve('src/handler.js'), 'utf8')
const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
it('V15 source contains no forbidden DynamoDB operations', () => expect(src).not.toMatch(/\b(ScanCommand|GetItemCommand|UpdateItemCommand|DeleteItemCommand|Batch\w*Command|TransactWrite\w*Command|CreateTableCommand|DeleteTableCommand)\b/))
it('V16 source contains no S3 usage', () => expect(src).not.toMatch(/@aws-sdk\/client-s3|\bs3\b/i))
it('V17 one exported handler serves both routes', () => {
  expect(handlerText.match(/export\s+(?:const|function|async function)\s+handler/g)).toHaveLength(1)
  expect(pkg.main ?? pkg.lambda).toBeUndefined()
})
it('V18 handler adds no CORS headers', () => expect(handlerText).not.toMatch(/Access-Control-Allow|\bCORS\b/i))
