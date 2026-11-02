#!/bin/sh
# Runs inside LocalStack once SQS is ready. Mirrors the queues Terraform creates on AWS.
set -e
REGION=eu-west-1

create_with_dlq() {
  name="$1"
  awslocal sqs create-queue --region "$REGION" --queue-name "$name-dlq" >/dev/null
  dlq_arn=$(awslocal sqs get-queue-attributes --region "$REGION" \
    --queue-url "http://localhost:4566/000000000000/$name-dlq" \
    --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)
  # After 5 failed receives a message moves to the dead-letter queue.
  awslocal sqs create-queue --region "$REGION" --queue-name "$name" \
    --attributes "{\"VisibilityTimeout\":\"30\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$dlq_arn\\\",\\\"maxReceiveCount\\\":\\\"5\\\"}\"}" >/dev/null
  echo "created $name (+ $name-dlq)"
}

create_with_dlq mm-events
touch /tmp/mm-queues-ready
