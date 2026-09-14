# =============================================================================
# Open ADMS :: Google Cloud
# Frontends on Firebase Hosting, the API on Cloud Run from the same root Dockerfile,
# Postgres on Cloud SQL.
# =============================================================================

terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

variable "project_id"   { type = string }
variable "region" {
  type = string
  default = "us-central1"
}
variable "name_prefix" {
  type = string
  default = "openadms"
}
variable "image_uri" {
  type = string
  description = "Artifact Registry image from the Dockerfile at the repo root"
}
variable "jwt_secret" {
  type = string
  sensitive = true
}
variable "instance_key" {
  type = string
  sensitive = true
}
variable "db_password" {
  type = string
  sensitive = true
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_sql_database_instance" "adms" {
  name             = "${var.name_prefix}-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier = "db-f1-micro"
    backup_configuration {
      enabled    = true
      start_time = "07:00"
    }
    ip_configuration { ipv4_enabled = true }
  }

  deletion_protection = false
}

resource "google_sql_database" "adms" {
  name     = "openadms"
  instance = google_sql_database_instance.adms.name
}

resource "google_sql_user" "adms" {
  name     = "adms"
  instance = google_sql_database_instance.adms.name
  password = var.db_password
}

locals {
  database_url = "postgresql://adms:${var.db_password}@${google_sql_database_instance.adms.public_ip_address}:5432/openadms"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "${var.name_prefix}-api"
  location = var.region

  template {
    containers {
      image = var.image_uri
      ports { container_port = 8080 }

      env {
        name  = "DATABASE_URL"
        value = local.database_url
      }

      env {
        name  = "JWT_SECRET"
        value = var.jwt_secret
      }

      env {
        name  = "INSTANCE_KEY"
        value = var.instance_key
      }

      env {
        name  = "ENVIRONMENT"
        value = "production"
      }
      env {
        name  = "CORS_ORIGIN_REGEX"
        value = "^https://${var.name_prefix}-(back-office|field)\\.web\\.app$"
      }

      startup_probe {
        http_get { path = "/health" }
        initial_delay_seconds = 10
        period_seconds        = 10
      }

      resources {
        limits = { cpu = "1", memory = "1Gi" }
      }
    }
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_firebase_hosting_site" "sites" {
  for_each = toset(["back-office", "field"])
  provider = google-beta
  project  = var.project_id
  site_id  = "${var.name_prefix}-${each.key}"
}

output "api_url"         { value = "${google_cloud_run_v2_service.api.uri}/api/v1" }
output "back_office_url" { value = "https://${var.name_prefix}-back-office.web.app" }
output "field_app_url"   { value = "https://${var.name_prefix}-field.web.app" }
output "database_url" {
  value = local.database_url
  sensitive = true
}
