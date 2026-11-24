import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const database = new DynamoDBClient({});
const storage = new S3Client({});
const secrets = new SecretsManagerClient({});
let apiKey;
const readStream = async (body) => Buffer.from(await body.transformToByteArray());
async function getApiKey() {
  if (apiKey) return apiKey;
  const secret = await secrets.send(new GetSecretValueCommand({ SecretId: process.env.OPENAI_API_KEY_SECRET_ARN }));
  apiKey = secret.SecretString;
  if (!apiKey) throw new Error("The OpenAI API key secret is empty.");
  return apiKey;
}
const setJob = (jobId, expression, values) => database.send(new UpdateItemCommand({ TableName: process.env.JOBS_TABLE, Key: { jobId: { S: jobId } }, UpdateExpression: expression, ExpressionAttributeNames: expression.includes("#error") ? { "#status": "status", "#error": "error" } : { "#status": "status" }, ExpressionAttributeValues: values }));

export const handler = async ({ jobId }) => {
  try {
    await setJob(jobId, "SET #status = :status", { ":status": { S: "processing" } });
    const job = await database.send(new GetItemCommand({ TableName: process.env.JOBS_TABLE, Key: { jobId: { S: jobId } }, ConsistentRead: true }));
    if (!job.Item) throw new Error("AI update job not found.");
    const input = await storage.send(new GetObjectCommand({ Bucket: process.env.JOBS_BUCKET, Key: job.Item.inputKey.S }));
    const form = new FormData();
    const creative = job.Item.mode?.S === "creative";
    form.append("model", "gpt-image-2.5-sunburst");
    form.append("prompt", creative
      ? `Refine this complete 4:5 real-estate flyer according to the user's instruction. Preserve all details that are not explicitly requested to change. Keep text accurate and legible, maintain the flyer proportions, and return one polished design. User instruction: ${job.Item.prompt.S}`
      : `Edit only this isolated source photograph according to the user's instruction. Do not add text, logos, borders, or watermarks. Keep the image suitable for placement back into an existing real-estate flyer. User instruction: ${job.Item.prompt.S}`);
    form.append("image", new Blob([await readStream(input.Body)], { type: job.Item.inputMimeType?.S || input.ContentType || "image/png" }), "source-image");
    form.append("output_format", "jpeg");
    form.append("quality", "high");
    const openAiResponse = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${await getApiKey()}` }, body: form });
    const result = await openAiResponse.json();
    if (!openAiResponse.ok || !result?.data?.[0]?.b64_json) throw new Error(result?.error?.message || "OpenAI did not return an edited image.");
    const outputKey = `output/${jobId}.jpg`;
    await storage.send(new PutObjectCommand({ Bucket: process.env.JOBS_BUCKET, Key: outputKey, Body: Buffer.from(result.data[0].b64_json, "base64"), ContentType: "image/jpeg" }));
    await setJob(jobId, "SET #status = :status, outputKey = :outputKey, mimeType = :mimeType", { ":status": { S: "completed" }, ":outputKey": { S: outputKey }, ":mimeType": { S: "image/jpeg" } });
  } catch (error) {
    console.error("AI worker failed", error);
    await setJob(jobId, "SET #status = :status, #error = :error", { ":status": { S: "failed" }, ":error": { S: error.message || "The AI update could not be completed." } }).catch((updateError) => console.error("Could not record job failure", updateError));
  }
};
