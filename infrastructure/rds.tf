resource "aws_security_group" "rds" {
  name        = "retail-rds-sg"
  description = "Allow inbound PostgreSQL from EKS worker nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "retail-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = "retail_db"
  username               = "postgres"
  password               = var.db_password
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  skip_final_snapshot    = true
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name                    = "retail-app/rds/credentials"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "rds_credentials" {
  secret_id = aws_secretsmanager_secret.rds_credentials.id
  secret_string = jsonencode({
    host     = element(split(":", aws_db_instance.postgres.endpoint), 0)
    username = aws_db_instance.postgres.username
    password = var.db_password
    dbname   = aws_db_instance.postgres.db_name
  })
}
