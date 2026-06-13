/**
 * Infrastructure as Code (IaC) Template Generator
 * Generates Terraform and CloudFormation code for cost remediation actions.
 */

/**
 * Generates Terraform plan / code block for a given recommendation
 * @param {object} recommendation - AwsRecommendation document
 * @returns {string} Terraform configuration code
 */
const generateTerraformPlan = (recommendation) => {
  const { resourceId, resourceType, currentDetails, recommendedDetails } = recommendation;
  const resourceNameClean = (recommendation.resourceName || resourceId).replace(/[^a-zA-Z0-9_-]/g, '_');

  switch (recommendation.recommendationType) {
    case 'rightsizing':
      if (resourceType === 'ec2') {
        const curType = currentDetails.instanceType || 't3.xlarge';
        const targetType = recommendedDetails.instanceType || 't3.large';
        return `# Terraform rightsizing plan for EC2 Instance: ${resourceId}
# Current type: ${curType} -> Recommended type: ${targetType}

resource "aws_instance" "${resourceNameClean}" {
  # Note: In production, import your resource first:
  # terraform import aws_instance.${resourceNameClean} ${resourceId}
  
  ami           = "ami-xxxxxxxxxxxxxxxxx" # Replace with your current AMI
  instance_type = "${targetType}" # Downsized from ${curType}

  lifecycle {
    ignore_changes = [ami]
  }

  tags = {
    "CipherGate-Remediated" = "true"
    "CipherGate-Action"     = "rightsizing"
  }
}`;
      } else if (resourceType === 'rds') {
        const curClass = currentDetails.dbInstanceClass || 'db.r5.xlarge';
        const targetClass = recommendedDetails.dbInstanceClass || 'db.r5.large';
        return `# Terraform rightsizing plan for RDS instance: ${resourceId}
# Current class: ${curClass} -> Recommended class: ${targetClass}

resource "aws_db_instance" "${resourceNameClean}" {
  # Note: Import your resource first:
  # terraform import aws_db_instance.${resourceNameClean} ${resourceId}

  identifier     = "${resourceId}"
  instance_class = "${targetClass}" # Downsized from ${curClass}
  apply_immediately = true

  tags = {
    "CipherGate-Remediated" = "true"
    "CipherGate-Action"     = "rightsizing"
  }
}`;
      }
      break;

    case 'idle_resource':
      if (resourceType === 'ec2') {
        return `# Terraform cleanup plan to stop / decommission idle EC2 instance: ${resourceId}
# WARNING: This will terminate the EC2 Instance. Verify backups exist.

resource "aws_instance" "${resourceNameClean}" {
  # Note: Import your resource first:
  # terraform import aws_instance.${resourceNameClean} ${resourceId}

  # To terminate, you can remove this block and run 'terraform destroy'
  # Alternatively, stop the instance by commenting out active properties or using aws cli:
  # aws ec2 stop-instances --instance-ids ${resourceId}

  ami           = "ami-xxxxxxxxxxxxxxxxx"
  instance_type = "${currentDetails.instanceType || 't3.xlarge'}"
  
  # Terminate protection set to false to allow automated decommissioning
  disable_api_termination = false
}`;
      }
      break;

    case 'cleanup':
      if (resourceType === 'ebs') {
        return `# Terraform cleanup plan to delete unattached EBS volume: ${resourceId}
# WARNING: This will delete the EBS volume. Ensure snapshots are taken first.

resource "aws_ebs_volume" "${resourceNameClean}" {
  # To delete, run 'terraform destroy' on this resource
  # Or delete it from code and run 'terraform apply'
  
  availability_zone = "us-east-1a"
  size              = ${currentDetails.sizeGb || 100}

  tags = {
    "Name" = "Unattached-Cleanup-Candidate"
  }
}`;
      }
      break;

    case 'savings_plan':
      return `# Savings Plan commitments cannot be bought directly via Terraform.
# Please purchase Savings Plans via the AWS Billing Console:
# Target Commitment: $${recommendedDetails.hourlyCommitment || '0.15'}/hour
# Term: ${recommendedDetails.term || '3-Year'}
# Type: ${recommendedDetails.type || 'Compute Savings Plans'}`;

    default:
      return `# No Terraform blueprint available for recommendation type: ${recommendation.recommendationType}`;
  }

  return `# Recommendation remediation template for ${resourceId}`;
};

/**
 * Generates CloudFormation template for a given recommendation
 * @param {object} recommendation - AwsRecommendation document
 * @returns {string} CloudFormation JSON/YAML template
 */
const generateCloudFormationTemplate = (recommendation) => {
  const { resourceId, resourceType, currentDetails, recommendedDetails } = recommendation;
  const resourceNameClean = (recommendation.resourceName || resourceId).replace(/[^a-zA-Z0-9]/g, '');

  switch (recommendation.recommendationType) {
    case 'rightsizing':
      if (resourceType === 'ec2') {
        const curType = currentDetails.instanceType || 't3.xlarge';
        const targetType = recommendedDetails.instanceType || 't3.large';
        return `AWSTemplateFormatVersion: '2010-09-09'
Description: Rightsizing CloudFormation template for EC2 ${resourceId}
Resources:
  ${resourceNameClean}:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: ${targetType} # Downsized from ${curType}
      ImageId: ami-xxxxxxxxxxxxxxxxx # Replace with current AMI ID
      Tags:
        - Key: CipherGate-Remediated
          Value: "true"`;
      } else if (resourceType === 'rds') {
        const curClass = currentDetails.dbInstanceClass || 'db.r5.xlarge';
        const targetClass = recommendedDetails.dbInstanceClass || 'db.r5.large';
        return `AWSTemplateFormatVersion: '2010-09-09'
Description: Rightsizing CloudFormation template for RDS ${resourceId}
Resources:
  ${resourceNameClean}:
    Type: AWS::RDS::DBInstance
    Properties:
      DBInstanceIdentifier: ${resourceId}
      DBInstanceClass: ${targetClass} # Downsized from ${curClass}
      Tags:
        - Key: CipherGate-Remediated
          Value: "true"`;
      }
      break;

    case 'idle_resource':
      if (resourceType === 'ec2') {
        return `AWSTemplateFormatVersion: '2010-09-09'
Description: CloudFormation template for decommissioned EC2 instance ${resourceId}
# Note: Deleting this resource from your stack template will terminate the instance on update.
Resources: {}`;
      }
      break;

    case 'cleanup':
      if (resourceType === 'ebs') {
        return `AWSTemplateFormatVersion: '2010-09-09'
Description: CloudFormation template for decommissioned EBS volume ${resourceId}
# Note: Deleting this resource from your template will delete the volume on stack update.
Resources: {}`;
      }
      break;

    default:
      return `AWSTemplateFormatVersion: '2010-09-09'
Description: Recommendation template not supported.`;
  }

  return `AWSTemplateFormatVersion: '2010-09-09'
Resources: {}`;
};

module.exports = {
  generateTerraformPlan,
  generateCloudFormationTemplate
};
