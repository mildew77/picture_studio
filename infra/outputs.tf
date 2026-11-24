output "site_url" {
  description = "HTTPS URL for Picture Studio."
  value       = "https://${var.site_domain}"
}

output "cloudfront_distribution_id" {
  description = "Use this ID when invalidating cached files after an out-of-band deploy."
  value       = aws_cloudfront_distribution.site.id
}

output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.site.domain_name
}

output "s3_bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "ai_update_endpoint" {
  description = "HTTP endpoint used by the deployed editor for Update with AI."
  value       = "${aws_apigatewayv2_api.ai_update.api_endpoint}/ai-update"
}
