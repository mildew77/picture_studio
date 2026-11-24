# Picture Studio AI backend

The backend uses a short-lived API Lambda plus a separate worker Lambda. The API stores the rendered PNG in a private S3 job bucket, returns a job ID immediately, and the browser polls while the worker calls OpenAI. This avoids API Gateway's 30-second HTTP API timeout. Input and output images expire after one day.

## One-time secret setup

Create an OpenAI API key in the OpenAI Platform, then store the key value (not JSON) in AWS Secrets Manager. For example:

```bash
aws secretsmanager create-secret \
  --name picture-studio/openai-api-key \
  --secret-string 'YOUR_OPENAI_API_KEY' \
  --profile image_builder \
  --region us-east-1
```

Copy the returned ARN into `infra/terraform.tfvars` as `openai_api_key_secret_arn`. Never put the key in `terraform.tfvars`, `ai-config.js`, or the browser.

The Lambda is deployed by the Terraform stack in `../infra`. The deployed site receives its API Gateway URL through a generated `ai-config.js` file.
