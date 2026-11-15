#!/bin/bash
set -e

echo "=== Mezzo Production Setup ==="
echo ""

# Check if .env exists
if [ -f .env ]; then
    echo "⚠️  .env file already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Edit .env manually or remove it first."
        exit 1
    fi
fi

# Copy template
cp .env.prod .env
echo "✓ Created .env from template"

# Generate secure secrets
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24)
S3_SECRET_ACCESS_KEY=$(openssl rand -base64 24)

# Replace placeholders
sed -i "s|POSTGRES_PASSWORD=CHANGE_ME_TO_A_SECURE_PASSWORD|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|g" .env
sed -i "s|JWT_ACCESS_SECRET=CHANGE_ME_TO_A_RANDOM_SECRET_AT_LEAST_32_CHARS|JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET|g" .env
sed -i "s|JWT_REFRESH_SECRET=CHANGE_ME_TO_A_DIFFERENT_RANDOM_SECRET_32_CHARS|JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET|g" .env
sed -i "s|S3_SECRET_ACCESS_KEY=CHANGE_ME_TO_A_SECURE_MINIO_PASSWORD|S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY|g" .env

echo "✓ Generated secure secrets"
echo ""
echo "✅ Setup complete! Now edit .env and fill in:"
echo "   - Payment provider keys (Paystack/Flutterwave)"
echo "   - Email/SMS provider keys (Resend/Termii)"
echo "   - AI provider key (Anthropic)"
echo "   - Your domain names"
echo "   - Admin email addresses"
echo ""
echo "Then run: docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "⚠️  IMPORTANT: Keep your .env file secure and never commit it to git!"
