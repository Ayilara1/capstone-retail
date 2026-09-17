module "karpenter" {
  source  = "terraform-aws-modules/eks/aws//modules/karpenter"
  version = "20.8.4"

  cluster_name = module.eks.cluster_name

  # Enable IRSA Mode
  enable_irsa            = true
  enable_pod_identity    = false 
  irsa_oidc_provider_arn = module.eks.oidc_provider_arn

  # Specify which Kubernetes Service Account builds the Trust Relationship
  irsa_namespace_service_accounts = ["karpenter:karpenter"]

  node_iam_role_additional_policies = {
    AmazonSSMManagedInstanceCore = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
  }
}
