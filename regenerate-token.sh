#!/bin/bash

echo "🔐 Regenerando OAuth Refresh Token..."
echo ""

# Verificar que existan las variables
if [ -z "$OAUTH_CLIENT_ID" ] || [ -z "$OAUTH_CLIENT_SECRET" ]; then
  echo "❌ Faltan variables de entorno"
  echo "Configura primero:"
  echo "  export OAUTH_CLIENT_ID='tu_client_id'"
  echo "  export OAUTH_CLIENT_SECRET='tu_client_secret'"
  exit 1
fi

echo "✅ Variables configuradas"
echo "   CLIENT_ID: $OAUTH_CLIENT_ID"
echo ""
echo "Ejecutando generador de token..."
node generate-oauth-token.cjs
