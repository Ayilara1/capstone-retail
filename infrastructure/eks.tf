module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.8.4"

  cluster_name    = var.cluster_name
  cluster_version = "1.32"

  cluster_endpoint_public_access = true
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets

  enable_cluster_creator_admin_permissions = true

  # Enable VPC CNI Network Policy Controller
  cluster_addons = {
    coredns = {}
    kube-proxy = {}
    vpc-cni = {
      configuration_values = jsonencode({
        enableNetworkPolicy = "true"
      })
    }
  }

  # Initial minimal node group to bootstrap Karpenter and CoreDNS
  eks_managed_node_groups = {
    system = {
      instance_types = ["t3.small"]
      min_size       = 1
      max_size       = 2
      desired_size   = 1
      capacity_type  = "SPOT"
      subnet_ids     = module.vpc.private_subnets
    }
  }

  node_security_group_tags = {
    "karpenter.sh/discovery" = var.cluster_name
  }
}
