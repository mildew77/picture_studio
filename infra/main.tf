data "aws_caller_identity" "current" {}

locals {
  ai_jobs_bucket_name = "${var.bucket_name}-ai-jobs"
  site_files = toset([
    "index.html",
    "app.js",
    "styles.css",
    "favicon.png",
    "picture-studio-base.png",
    "kingham.png",
    "kingham-instagram.png",
  ])

  content_types = {
    "index.html"              = "text/html; charset=utf-8"
    "app.js"                  = "application/javascript; charset=utf-8"
    "styles.css"              = "text/css; charset=utf-8"
    "favicon.png"             = "image/png"
    "picture-studio-base.png" = "image/png"
    "kingham.png"             = "image/png"
    "kingham-instagram.png"   = "image/png"
  }

}

data "archive_file" "ai_update" {
  type        = "zip"
  source_file = "${path.module}/../backend/lambda/ai-update.mjs"
  output_path = "${path.module}/.build/ai-update.zip"
}

data "archive_file" "ai_update_worker" {
  type        = "zip"
  source_file = "${path.module}/../backend/lambda/ai-update-worker.mjs"
  output_path = "${path.module}/.build/ai-update-worker.zip"
}

resource "aws_iam_role" "ai_update" {
  name = "picture-studio-ai-update"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "ai_update" {
  name = "picture-studio-ai-update"
  role = aws_iam_role.ai_update.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/picture-studio-ai-update:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.ai_jobs.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.ai_jobs.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.ai_update_worker.arn
      }
    ]
  })
}

resource "aws_lambda_function" "ai_update" {
  function_name    = "picture-studio-ai-update"
  role             = aws_iam_role.ai_update.arn
  handler          = "ai-update.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.ai_update.output_path
  source_code_hash = data.archive_file.ai_update.output_base64sha256
  timeout          = 30
  memory_size      = 1024

  environment {
    variables = {
      OPENAI_API_KEY_SECRET_ARN = var.openai_api_key_secret_arn
      SITE_ORIGIN               = "https://${var.site_domain}"
      JOBS_BUCKET               = aws_s3_bucket.ai_jobs.id
      JOBS_TABLE                = aws_dynamodb_table.ai_jobs.name
      WORKER_FUNCTION_NAME      = aws_lambda_function.ai_update_worker.function_name
    }
  }
  tags = var.tags
}

resource "aws_iam_role" "ai_update_worker" {
  name               = "picture-studio-ai-update-worker"
  assume_role_policy = aws_iam_role.ai_update.assume_role_policy
  tags               = var.tags
}

resource "aws_iam_role_policy" "ai_update_worker" {
  name = "picture-studio-ai-update-worker"
  role = aws_iam_role.ai_update_worker.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/picture-studio-ai-update-worker:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = aws_dynamodb_table.ai_jobs.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.ai_jobs.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.openai_api_key_secret_arn
      }
    ]
  })
}

resource "aws_lambda_function" "ai_update_worker" {
  function_name    = "picture-studio-ai-update-worker"
  role             = aws_iam_role.ai_update_worker.arn
  handler          = "ai-update-worker.handler"
  runtime          = "nodejs22.x"
  filename         = data.archive_file.ai_update_worker.output_path
  source_code_hash = data.archive_file.ai_update_worker.output_base64sha256
  timeout          = 300
  memory_size      = 1024

  environment {
    variables = {
      OPENAI_API_KEY_SECRET_ARN = var.openai_api_key_secret_arn
      JOBS_BUCKET               = aws_s3_bucket.ai_jobs.id
      JOBS_TABLE                = aws_dynamodb_table.ai_jobs.name
    }
  }
  tags = var.tags
}

resource "aws_apigatewayv2_api" "ai_update" {
  name          = "picture-studio-ai-update"
  protocol_type = "HTTP"
  cors_configuration {
    allow_headers = ["content-type"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_origins = ["https://${var.site_domain}", "http://localhost:4173"]
    max_age       = 300
  }
  tags = var.tags
}

resource "aws_apigatewayv2_integration" "ai_update" {
  api_id                 = aws_apigatewayv2_api.ai_update.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ai_update.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ai_update" {
  api_id    = aws_apigatewayv2_api.ai_update.id
  route_key = "POST /ai-update"
  target    = "integrations/${aws_apigatewayv2_integration.ai_update.id}"
}

resource "aws_apigatewayv2_route" "ai_update_status" {
  api_id    = aws_apigatewayv2_api.ai_update.id
  route_key = "GET /ai-update/{jobId}"
  target    = "integrations/${aws_apigatewayv2_integration.ai_update.id}"
}

# An HTTP API has no callable endpoint until it has a stage. The $default stage
# keeps the public URL free of a stage suffix and auto-deploys route changes.
resource "aws_apigatewayv2_stage" "ai_update" {
  api_id      = aws_apigatewayv2_api.ai_update.id
  name        = "$default"
  auto_deploy = true
  tags        = var.tags
}

resource "aws_lambda_permission" "allow_api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai_update.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ai_update.execution_arn}/*/*"
}

resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# AI input and output images are kept separate from the public site origin and
# are automatically removed after one day.
resource "aws_s3_bucket" "ai_jobs" {
  bucket = local.ai_jobs_bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_public_access_block" "ai_jobs" {
  bucket                  = aws_s3_bucket.ai_jobs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "ai_jobs" {
  bucket = aws_s3_bucket.ai_jobs.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "ai_jobs" {
  bucket = aws_s3_bucket.ai_jobs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "ai_jobs" {
  bucket = aws_s3_bucket.ai_jobs.id
  rule {
    id     = "delete-ai-jobs-after-one-day"
    status = "Enabled"
    filter {}
    expiration { days = 1 }
  }
}

resource "aws_dynamodb_table" "ai_jobs" {
  name         = "picture-studio-ai-jobs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"
  attribute {
    name = "jobId"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  server_side_encryption { enabled = true }
  tags = var.tags
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "picture-studio-${var.bucket_name}"
  description                       = "OAC for the Picture Studio S3 origin"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.site_domain
  validation_method = "DNS"
  tags              = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  # This stack requests one certificate name, so a static key keeps the
  # resource address known during `terraform plan`. ACM supplies the DNS
  # validation record values during apply.
  for_each = {
    site = tolist(aws_acm_certificate.site.domain_validation_options)[0]
  }

  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  ttl             = 60
  records         = [each.value.resource_record_value]
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Picture Studio at ${var.site_domain}"
  default_root_object = "index.html"
  aliases             = [var.site_domain]
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "picture-studio-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "picture-studio-s3"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "origin_read" {
  statement {
    sid     = "AllowCloudFrontReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = ["${aws_s3_bucket.site.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "origin_read" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.origin_read.json
}

resource "aws_route53_record" "site_a" {
  zone_id = var.route53_zone_id
  name    = var.site_domain
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  zone_id = var.route53_zone_id
  name    = var.site_domain
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_s3_object" "site" {
  for_each = local.site_files

  bucket        = aws_s3_bucket.site.id
  key           = each.value
  source        = "${path.module}/../${each.value}"
  etag          = filemd5("${path.module}/../${each.value}")
  content_type  = local.content_types[each.value]
  cache_control = contains(["index.html", "app.js", "styles.css"], each.value) ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable"
}

resource "aws_s3_object" "ai_config" {
  bucket        = aws_s3_bucket.site.id
  key           = "ai-config.js"
  content       = "window.PICTURE_STUDIO_AI_ENDPOINT = ${jsonencode("${aws_apigatewayv2_api.ai_update.api_endpoint}/ai-update")};\n"
  content_type  = "application/javascript; charset=utf-8"
  cache_control = "no-cache, no-store, must-revalidate"
}
