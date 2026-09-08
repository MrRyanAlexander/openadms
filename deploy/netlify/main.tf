# =============================================================================
# Open ADMS :: Netlify + Railway
#
# This is the declarative path. For most people the CLI provisioner is easier
# and needs no GitHub connection:
#
#     npm run setup            # choose Netlify + Railway
#     npm run deploy:netlify   # re-run provisioning on its own
#
# Use this stack when you want the deployment in version-controlled state.
# =============================================================================

terraform {
  required_version = ">= 1.6"

  required_providers {
    netlify = {
      source  = "netlify/netlify"
      version = "~> 0.2"
    }
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.4"
    }
  }
}

variable "netlify_token" {
  type        = string
  sensitive   = true
  description = "Netlify personal access token"
}

variable "railway_token" {
  type        = string
  sensitive   = true
  description = "Railway API token"
}

variable "github_repo" {
  type        = string
  description = "owner/repo holding this monorepo"
}

variable "branch" {
  type    = string
  default = "main"
}

variable "instance_name" {
  type    = string
  default = "Open ADMS"
}

variable "instance_key" {
  type        = string
  sensitive   = true
  description = "64 hex characters. The installer mints this."
}

variable "jwt_secret" {
  type      = string
  sensitive = true
}

variable "database_url" {
  type      = string
  sensitive = true
  default   = ""
}

variable "site_prefix" {
  type    = string
  default = "openadms"
}

provider "netlify" {
  token = var.netlify_token
}

provider "railway" {
  token = var.railway_token
}

# ---------------------------------------------------------------------------
# Backend compute
# ---------------------------------------------------------------------------
resource "railway_project" "adms" {
  name        = "${var.site_prefix}-api"
  private     = true
  description = "Open ADMS API and Postgres"
}

resource "railway_service" "api" {
  name               = "api"
  project_id         = railway_project.adms.id
  source_repo        = var.github_repo
  source_repo_branch = var.branch
  root_directory     = "/backend"
}

resource "railway_variable_collection" "api" {
  environment_id = railway_project.adms.default_environment.id
  service_id     = railway_service.api.id

  variables = [
    {
      name  = "DATABASE_URL"
      value = var.database_url
    },
    {
      name  = "JWT_SECRET"
      value = var.jwt_secret
    },
    {
      name  = "INSTANCE_KEY"
      value = var.instance_key
    },
    {
      name  = "ENVIRONMENT"
      value = "production"
    },
    {
      name  = "PORT"
      value = "8080"
    },
    {
      # Accept Netlify's dynamically generated preview URLs by pattern.
      name  = "CORS_ORIGIN_REGEX"
      value = "^https://([a-z0-9-]+--)?${var.site_prefix}-(back-office|field)\\.netlify\\.app$"
    },
  ]
}

# ---------------------------------------------------------------------------
# Frontends
# ---------------------------------------------------------------------------
resource "netlify_site" "back_office" {
  name = "${var.site_prefix}-back-office"

  build_settings {
    base        = "frontend"
    command     = "npm ci && npm run build"
    publish     = "frontend/dist"
    repo_url    = "https://github.com/${var.github_repo}"
    repo_branch = var.branch
  }
}

resource "netlify_site" "field" {
  name = "${var.site_prefix}-field"

  build_settings {
    base        = "mobile"
    command     = "npm ci && npm run build"
    publish     = "mobile/dist"
    repo_url    = "https://github.com/${var.github_repo}"
    repo_branch = var.branch
  }
}

locals {
  api_url = "https://${railway_service.api.name}-${railway_project.adms.id}.up.railway.app/api/v1"
}

resource "netlify_environment_variable" "back_office_api" {
  site_id = netlify_site.back_office.id
  key     = "VITE_API_URL"
  value   = local.api_url
}

resource "netlify_environment_variable" "field_api" {
  site_id = netlify_site.field.id
  key     = "VITE_API_URL"
  value   = local.api_url
}

output "api_url" {
  value = local.api_url
}

output "back_office_url" {
  value = "https://${netlify_site.back_office.name}.netlify.app"
}

output "field_app_url" {
  value = "https://${netlify_site.field.name}.netlify.app"
}

output "instance_key" {
  value     = var.instance_key
  sensitive = true
}
