# Security Guide

## Infrastructure Security

### Environment Variables

1. **Never commit `.env` files** - They are in `.gitignore`
2. **Use `.env.example`** as a template
3. **Generate strong secrets**:
   ```bash
   # Generate JWT secret
   openssl rand -base64 32
   ```

### JWT Secret

- **Minimum length**: 32 characters
- **Production requirement**: Must be set and strong
- **Default secret**: Will cause server to exit in production

### Rate Limiting

- **Auth endpoints**: 5 attempts per 15 minutes
- **API endpoints**: 100 requests per 15 minutes  
- **Admin endpoints**: 50 requests per 15 minutes

### File Upload Security

- **Allowed types**: JPEG, PNG, GIF, WebP only
- **Size limit**: 40MB per file
- **Validation**: MIME type + file extension + filename checks
- **Path traversal**: Blocked

### Database Security

- **File permissions**: Database file should have restricted permissions
- **Backup encryption**: Encrypt backups before storing
- **Access control**: Limit database file access to application user only

### Security Headers

- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Content-Security-Policy` - Restricts resource loading
- `Strict-Transport-Security` - Enforces HTTPS (production)

### Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ characters)
- [ ] Set `NODE_ENV=production`
- [ ] Set `REQUIRE_HTTPS=true`
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Use HTTPS/SSL certificates
- [ ] Restrict database file permissions
- [ ] Set up automated backups
- [ ] Enable monitoring and logging
- [ ] Review and restrict file upload limits
- [ ] Set up firewall rules
- [ ] Use environment-specific `.env` files

### Database File Permissions

```bash
# Restrict database file to owner only
chmod 600 backend/mulligan.db

# Or for read-only access by group
chmod 640 backend/mulligan.db
```

### Monitoring

- Monitor failed authentication attempts
- Track rate limit violations
- Log admin actions
- Monitor file uploads

### Backup Security

- Encrypt database backups
- Store backups in secure location
- Test backup restoration regularly
- Use version control for schema changes









