# Picture Studio on CloudFront

This Terraform stack publishes the static editor from the repository root to a private S3 bucket, serves it through CloudFront Origin Access Control (OAC), and creates an ACM-backed HTTPS custom domain with Route 53 alias records.

## Important hostname constraint

`picture_studio.marshall.mortgage` cannot be used: underscores are not permitted in DNS hostnames, CloudFront alternate domain names, or public ACM certificate names. This stack uses `picture-studio.marshall.mortgage` instead.

## Prerequisites

1. The parent DNS zone must be hosted in Route 53 in the same AWS account used by Terraform.
2. Create an OpenAI Platform API key and store its value in AWS Secrets Manager. See [`../backend/README.md`](../backend/README.md). A ChatGPT subscription and API billing are separate; the key must be from the OpenAI Platform.
3. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in a globally unique bucket name, a valid `site_domain`, the Route 53 hosted-zone ID, and the secret ARN.
4. Attach the policy in `iam-deploy-policy.json` to the IAM principal running Terraform after replacing its placeholders. `REPLACE_WITH_AI_JOBS_BUCKET_NAME` is your regular `bucket_name` with `-ai-jobs` appended.

## Deploy

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan
terraform apply
```

Terraform uploads `index.html`, JavaScript, CSS, the favicon, and the template PNG assets. It also deploys a Lambda function behind API Gateway and generates the deployed `ai-config.js` file with that endpoint. Re-running `terraform apply` updates changed assets. The `index.html` cache policy is intentionally no-cache; version static assets if you want long-term immutable caching.
