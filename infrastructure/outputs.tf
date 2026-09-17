output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "external_secrets_role_arn" {
  value = module.external_secrets_irsa.iam_role_arn
}

output "lb_controller_role_arn" {
  value = module.load_balancer_controller_irsa.iam_role_arn
}

output "karpenter_node_role_name" {
  value = module.karpenter.node_iam_role_name
}
