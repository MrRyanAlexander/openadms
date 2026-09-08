# =============================================================================
# Open ADMS :: AWS
# Frontends on S3 + CloudFront, the API on App Runner from the same Dockerfile,
# Postgres on RDS. Same code, same environment variables, different plumbing.
# =============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

variable "region" {
  type = string
  default = "us-east-2"
}
variable "name_prefix" {
  type = string
  default = "openadms"
}
variable "jwt_secret" {
  type = string
  sensitive = true
}
variable "instance_key" {
  type = string
  sensitive = true
}
variable "db_username" {
  type = string
  default = "adms"
}
variable "db_password" {
  type = string
  sensitive = true
}
variable "db_instance" {
  type = string
  default = "db.t4g.micro"
}
variable "image_uri" {
  type = string
  description = "ECR image built from backend/Dockerfile"
}

provider "aws" { region = var.region }

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
resource "aws_db_subnet_group" "adms" {
  name       = "${var.name_prefix}-db"
  subnet_ids = data.aws_subnets.default.ids
}

data "aws_vpc" "default" { default = true }

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "db" {
  name   = "${var.name_prefix}-db"
  vpc_id = data.aws_vpc.default.id

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.default.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "adms" {
  identifier             = "${var.name_prefix}-pg"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.db_instance
  allocated_storage      = 20
  storage_encrypted      = true
  db_name                = "openadms"
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.adms.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = true
  apply_immediately      = true
  backup_retention_period = 7
}

locals {
  database_url = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.adms.endpoint}/openadms"
}

# ---------------------------------------------------------------------------
# API on App Runner, built from backend/Dockerfile
# ---------------------------------------------------------------------------
resource "aws_apprunner_service" "api" {
  service_name = "${var.name_prefix}-api"

  source_configuration {
    image_repository {
      image_identifier      = var.image_uri
      image_repository_type = "ECR"

      image_configuration {
        port = "8080"
        runtime_environment_variables = {
          DATABASE_URL      = local.database_url
          JWT_SECRET        = var.jwt_secret
          INSTANCE_KEY      = var.instance_key
          ENVIRONMENT       = "production"
          CORS_ORIGIN_REGEX = "^https://[a-z0-9]+\\.cloudfront\\.net$"
        }
      }
    }
    auto_deployments_enabled = true
  }

  health_check_configuration {
    path     = "/health"
    protocol = "HTTP"
    interval = 15
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }
}

# ---------------------------------------------------------------------------
# Frontends on S3 + CloudFront
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "site" {
  for_each = toset(["back-office", "field"])
  bucket   = "${var.name_prefix}-${each.key}"
}

resource "aws_s3_bucket_website_configuration" "site" {
  for_each = aws_s3_bucket.site
  bucket   = each.value.id

  index_document { suffix = "index.html" }
  # Single page apps: unknown paths resolve to the shell.
  error_document { key = "index.html" }
}

resource "aws_cloudfront_distribution" "site" {
  for_each            = aws_s3_bucket_website_configuration.site
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name = each.value.website_endpoint
    origin_id   = each.key

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = each.key
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate { cloudfront_default_certificate = true }
}

output "api_url"         { value = "https://${aws_apprunner_service.api.service_url}/api/v1" }
output "back_office_url" { value = "https://${aws_cloudfront_distribution.site["back-office"].domain_name}" }
output "field_app_url"   { value = "https://${aws_cloudfront_distribution.site["field"].domain_name}" }
output "database_url" {
  value = local.database_url
  sensitive = true
}
