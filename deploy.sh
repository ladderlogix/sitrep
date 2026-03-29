#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STACK_NAME="sitrep"
FINDINGS_TABLE="SitRepFindings"
NOTES_TABLE="SitRepNotes"
LAMBDA_NAME="SitRepAPI"
API_NAME="SitRepAPI"
S3_BUCKET="sitrep-dashboard-${ACCOUNT_ID}"
ROLE_NAME="SitRepLambdaRole"

echo "=== SitRep Deployment ==="
echo "Account: $ACCOUNT_ID | Region: $REGION"

# ─── 1. DynamoDB Tables ───
echo ""
echo "[1/7] Creating DynamoDB tables..."

aws dynamodb create-table \
  --table-name "$FINDINGS_TABLE" \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null && echo "  Created $FINDINGS_TABLE" || echo "  $FINDINGS_TABLE already exists"

aws dynamodb create-table \
  --table-name "$NOTES_TABLE" \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null && echo "  Created $NOTES_TABLE" || echo "  $NOTES_TABLE already exists"

# Wait for tables to be active
echo "  Waiting for tables..."
aws dynamodb wait table-exists --table-name "$FINDINGS_TABLE" --region "$REGION"
aws dynamodb wait table-exists --table-name "$NOTES_TABLE" --region "$REGION"
echo "  Tables ready!"

# ─── 2. IAM Role ───
echo ""
echo "[2/7] Creating Lambda IAM role..."

TRUST_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}'

ROLE_ARN=$(aws iam create-role \
  --role-name "$ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --query 'Role.Arn' --output text 2>/dev/null) && echo "  Created role" || {
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)
  echo "  Role already exists"
}

echo "  Role ARN: $ROLE_ARN"

# Attach policies
aws iam attach-role-policy --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true

DYNAMO_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Scan",
      "dynamodb:Query"
    ],
    "Resource": [
      "arn:aws:dynamodb:'"$REGION"':'"$ACCOUNT_ID"':table/SitRep*"
    ]
  }]
}'

aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name SitRepDynamoAccess \
  --policy-document "$DYNAMO_POLICY"
echo "  Policies attached"

# Wait for role propagation
echo "  Waiting for IAM propagation..."
sleep 10

# ─── 3. Package Lambda ───
echo ""
echo "[3/7] Packaging Lambda function..."

cd /home/stephen/tracerFireTool/backend
zip -j /tmp/sitrep-lambda.zip lambda_function.py
echo "  Lambda packaged"

# ─── 4. Create/Update Lambda ───
echo ""
echo "[4/7] Deploying Lambda function..."

LAMBDA_ARN=$(aws lambda create-function \
  --function-name "$LAMBDA_NAME" \
  --runtime python3.12 \
  --handler lambda_function.lambda_handler \
  --role "$ROLE_ARN" \
  --zip-file fileb:///tmp/sitrep-lambda.zip \
  --timeout 30 \
  --memory-size 256 \
  --environment "Variables={FINDINGS_TABLE=$FINDINGS_TABLE,NOTES_TABLE=$NOTES_TABLE,AWS_REGION_NAME=$REGION}" \
  --region "$REGION" \
  --query 'FunctionArn' --output text 2>/dev/null) && echo "  Created Lambda" || {
  aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file fileb:///tmp/sitrep-lambda.zip \
    --region "$REGION" > /dev/null
  aws lambda update-function-configuration \
    --function-name "$LAMBDA_NAME" \
    --environment "Variables={FINDINGS_TABLE=$FINDINGS_TABLE,NOTES_TABLE=$NOTES_TABLE,AWS_REGION_NAME=$REGION}" \
    --region "$REGION" > /dev/null
  LAMBDA_ARN=$(aws lambda get-function --function-name "$LAMBDA_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)
  echo "  Updated Lambda"
}
echo "  Lambda ARN: $LAMBDA_ARN"

# ─── 5. API Gateway ───
echo ""
echo "[5/7] Setting up API Gateway..."

# Check if API already exists
API_ID=$(aws apigateway get-rest-apis --region "$REGION" --query "items[?name=='$API_NAME'].id" --output text)

if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then
  API_ID=$(aws apigateway create-rest-api \
    --name "$API_NAME" \
    --description "SitRep CTF API" \
    --endpoint-configuration '{"types":["REGIONAL"]}' \
    --region "$REGION" \
    --query 'id' --output text)
  echo "  Created API: $API_ID"
else
  echo "  API exists: $API_ID"
fi

# Get root resource
ROOT_ID=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" \
  --query 'items[?path==`/`].id' --output text)

# Create proxy resource {proxy+}
PROXY_ID=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" \
  --query 'items[?path==`/{proxy+}`].id' --output text)

if [ -z "$PROXY_ID" ] || [ "$PROXY_ID" = "None" ]; then
  PROXY_ID=$(aws apigateway create-resource \
    --rest-api-id "$API_ID" \
    --parent-id "$ROOT_ID" \
    --path-part '{proxy+}' \
    --region "$REGION" \
    --query 'id' --output text)
  echo "  Created proxy resource"
fi

# Setup ANY method on proxy resource
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$PROXY_ID" \
  --http-method ANY \
  --authorization-type NONE \
  --region "$REGION" 2>/dev/null || true

aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$PROXY_ID" \
  --http-method ANY \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
  --region "$REGION" > /dev/null

# Also set up root path methods for OPTIONS
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$ROOT_ID" \
  --http-method ANY \
  --authorization-type NONE \
  --region "$REGION" 2>/dev/null || true

aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$ROOT_ID" \
  --http-method ANY \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/${LAMBDA_ARN}/invocations" \
  --region "$REGION" > /dev/null

# Deploy API
aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --stage-name prod \
  --region "$REGION" > /dev/null
echo "  API deployed to prod stage"

API_URL="https://${API_ID}.execute-api.${REGION}.amazonaws.com/prod"
echo "  API URL: $API_URL"

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id apigateway-invoke-all \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT_ID}:${API_ID}/*" \
  --region "$REGION" 2>/dev/null || true
echo "  Lambda permission granted"

# ─── 6. Build Frontend ───
echo ""
echo "[6/7] Building frontend..."

cd /home/stephen/tracerFireTool/frontend

# Inject API URL into the build
cat > src/config.js << JSEOF
window.SITREP_API = "${API_URL}";
JSEOF

# Add config.js to index.html
sed -i 's|<div id="root">|<script src="%PUBLIC_URL%/config.js"></script>\n    <div id="root">|' public/index.html

# Copy config to public for runtime
cp src/config.js public/config.js

npm install --legacy-peer-deps 2>&1 | tail -3
npm run build 2>&1 | tail -5

echo "  Frontend built!"

# ─── 7. S3 Static Hosting ───
echo ""
echo "[7/7] Deploying frontend to S3..."

aws s3 mb "s3://$S3_BUCKET" --region "$REGION" 2>/dev/null || echo "  Bucket exists"

# Disable block public access
aws s3api put-public-access-block \
  --bucket "$S3_BUCKET" \
  --public-access-block-configuration "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --region "$REGION"

# Enable static website hosting
aws s3 website "s3://$S3_BUCKET" --index-document index.html --error-document index.html

# Bucket policy for public read
BUCKET_POLICY='{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicRead",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::'"$S3_BUCKET"'/*"
  }]
}'
aws s3api put-bucket-policy --bucket "$S3_BUCKET" --policy "$BUCKET_POLICY" --region "$REGION"

# Upload build
aws s3 sync build/ "s3://$S3_BUCKET/" --delete --region "$REGION" | tail -3

SITE_URL="http://${S3_BUCKET}.s3-website-${REGION}.amazonaws.com"

echo ""
echo "============================================"
echo "  SitRep Deployment Complete!"
echo "============================================"
echo ""
echo "  Dashboard:  $SITE_URL"
echo "  API:        $API_URL"
echo ""
echo "  DynamoDB:   $FINDINGS_TABLE, $NOTES_TABLE"
echo "  Lambda:     $LAMBDA_NAME"
echo "  S3 Bucket:  $S3_BUCKET"
echo ""
echo "  Test the API:"
echo "  curl ${API_URL}/api/stats"
echo ""
echo "============================================"
