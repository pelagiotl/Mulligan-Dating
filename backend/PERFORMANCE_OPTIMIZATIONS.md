# Database Performance Optimizations

## Recommended Database Indexes

To improve query performance, especially for the matches endpoint and user browsing, add the following indexes:

### 1. Matches Table
```sql
-- Index for finding matches by user_id (most common query)
CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);

-- Index for finding matches by other_user_id
CREATE INDEX IF NOT EXISTS idx_matches_other_user_id ON matches(other_user_id);

-- Composite index for finding matches by user_id and stage
CREATE INDEX IF NOT EXISTS idx_matches_user_stage ON matches(user_id, stage);

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_matches_expires_at ON matches(expires_at) WHERE expires_at IS NOT NULL;
```

### 2. Messages Table
```sql
-- Index for finding messages by match_id (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_match_id ON messages(match_id);

-- Index for finding unread messages
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;

-- Composite index for match_id and sent_at (for ordering)
CREATE INDEX IF NOT EXISTS idx_messages_match_sent ON messages(match_id, sent_at DESC);
```

### 3. Photos Table
```sql
-- Index for finding photos by profile_id
CREATE INDEX IF NOT EXISTS idx_photos_profile_id ON photos(profile_id);

-- Index for finding primary photo
CREATE INDEX IF NOT EXISTS idx_photos_primary ON photos(profile_id, is_primary) WHERE is_primary = true;

-- Index for display_order (for sorting)
CREATE INDEX IF NOT EXISTS idx_photos_display_order ON photos(profile_id, display_order);
```

### 4. User Preferences Table
```sql
-- Index for finding preferences by user_id
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
```

### 5. Profiles Table
```sql
-- Index for location-based queries (if using location filtering)
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(location) WHERE location IS NOT NULL;

-- Index for age filtering
CREATE INDEX IF NOT EXISTS idx_profiles_age ON profiles(age) WHERE age IS NOT NULL;
```

## Query Optimization Notes

1. **Matches Endpoint**: The N+1 query fix has been implemented. These indexes will further improve performance.

2. **User Browsing**: Consider adding a composite index on `(gender, age, location)` if location-based filtering is common.

3. **Message Queries**: The `idx_messages_match_sent` index will significantly speed up message loading in chat views.

4. **Photo Queries**: The `idx_photos_profile_id` and `idx_photos_display_order` indexes will speed up photo loading for profiles.

## Implementation

Run these SQL commands in your database to create the indexes. They can be added safely without downtime.

```bash
# Connect to your database and run the SQL commands above
# Or add them to a migration file
```

## Monitoring

After adding indexes, monitor:
- Query execution times (should decrease)
- Database size (indexes use additional storage)
- Write performance (indexes slightly slow down INSERT/UPDATE operations)

