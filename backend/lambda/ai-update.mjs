import { randomUUID } from "node:crypto";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const database = new DynamoDBClient({});
const lambda = new LambdaClient({});
const storage = new S3Client({});
const maxImageBytes = 6 * 1024 * 1024;
const allowedOrigin = process.env.SITE_ORIGIN || "*";
const response = (statusCode, body) => ({ statusCode, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": allowedOrigin, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" }, body: JSON.stringify(body) });
const readStream = async (body) => Buffer.from(await body.transformToByteArray());

async function startJob(event) {
  const { prompt, imageBase64, imageMimeType = "image/png", mode = "creative" } = JSON.parse(event.body || "{}");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) return response(400, { error: "Provide an AI update prompt of up to 4,000 characters." });
  if (typeof imageBase64 !== "string" || !imageBase64) return response(400, { error: "A rendered PNG is required." });
  if (!["creative", "safe"].includes(mode)) return response(400, { error: "Choose a valid AI update mode." });
  if (!/^image\/(png|jpeg|webp)$/.test(imageMimeType)) return response(400, { error: "Use a PNG, JPEG, or WebP image." });
  const image = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), "base64");
  if (!image.length || image.length > maxImageBytes) return response(413, { error: "The rendered PNG must be smaller than 6 MB." });
  const jobId = randomUUID();
  const inputKey = `input/${jobId}.png`;
  await storage.send(new PutObjectCommand({ Bucket: process.env.JOBS_BUCKET, Key: inputKey, Body: image, ContentType: imageMimeType }));
  await database.send(new PutItemCommand({ TableName: process.env.JOBS_TABLE, Item: { jobId: { S: jobId }, status: { S: "queued" }, mode: { S: mode }, prompt: { S: prompt.trim() }, inputKey: { S: inputKey }, inputMimeType: { S: imageMimeType }, expiresAt: { N: String(Math.floor(Date.now() / 1000) + 86400) } } }));
  await lambda.send(new InvokeCommand({ FunctionName: process.env.WORKER_FUNCTION_NAME, InvocationType: "Event", Payload: Buffer.from(JSON.stringify({ jobId })) }));
  return response(202, { jobId, status: "queued" });
}

async function getJob(jobId) {
  const result = await database.send(new GetItemCommand({ TableName: process.env.JOBS_TABLE, Key: { jobId: { S: jobId } }, ConsistentRead: true }));
  if (!result.Item) return response(404, { error: "AI update job not found." });
  const { status, error, outputKey, mimeType } = result.Item;
  if (status.S === "failed") return response(200, { status: "failed", error: error?.S });
  if (status.S !== "completed") return response(200, { status: status.S });
  const output = await storage.send(new GetObjectCommand({ Bucket: process.env.JOBS_BUCKET, Key: outputKey.S }));
  const image = await readStream(output.Body);
  return response(200, { status: "completed", mimeType: mimeType?.S || output.ContentType || "image/png", imageBase64: image.toString("base64") });
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method;
  try {
    if (method === "OPTIONS") return response(204, {});
    if (method === "GET") return await getJob(event.pathParameters?.jobId);
    if (method === "POST") return await startJob(event);
    return response(405, { error: "Method not allowed." });
  } catch (error) {
    console.error("AI update request failed", error);
    return response(500, { error: "The AI update could not be started. Check the Lambda logs for details." });
  }
};
