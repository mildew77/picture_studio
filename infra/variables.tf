variable "aws_region" {
  description = "AWS Region for the private S3 origin."
  type        = string
  default     = "us-east-1"
}

variable "bucket_name" {
  description = "Globally unique S3 bucket name for the Picture Studio site."
  type        = string
}

variable "site_domain" {
  description = "Valid DNS hostname for CloudFront, for example picture-studio.marshall.mortgage. Underscores are not permitted."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$", var.site_domain))
    error_message = "site_domain must be a valid lowercase DNS hostname and cannot contain underscores."
  }
}

variable "route53_zone_id" {
  description = "Route 53 hosted-zone ID for the parent zone that owns site_domain."
  type        = string
}

variable "openai_api_key_secret_arn" {
  description = "ARN of an existing AWS Secrets Manager secret whose SecretString is the OpenAI API key."
  type        = string
  sensitive   = true
}

variable "tags" {
  description = "Tags applied to regional AWS resources."
  type        = map(string)
  default = {
    Application = "picture-studio"
    ManagedBy   = "terraform"
  }
}
