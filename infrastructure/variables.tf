variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "cluster_name" {
  type    = string
  default = "retail-eks-cluster"
}

variable "db_password" {
  type      = string
  sensitive = true
  default   = "RetailSecurePass2026!"
}
