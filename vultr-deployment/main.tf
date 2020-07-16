provider "vultr" {
  api_key = "DNBT4GNZGW4WPQPY4NARSFLCY6PFIL4E5CDQ"
  rate_limit = 700
  retry_limit = 3
}

data "vultr_region" "seoul" {
  filter {
    name   = "name"
    values = ["Seoul"]
  }
}

data "vultr_os" "centos" {
  filter {
    name   = "name"
    values = ["CentOS 7 x64"]
  }
}

data "vultr_plan" "starter" {
  filter {
    name   = "price_per_month"
    values = ["5.00"]
  }

  filter {
    name   = "ram"
    values = ["1024"]
  }
}

output "region" {
  value = [data.vultr_region.seoul]
}
output "os" {
  value = [data.vultr_os.centos]
}
output "starter" {
  value = [data.vultr_plan.starter]
}
