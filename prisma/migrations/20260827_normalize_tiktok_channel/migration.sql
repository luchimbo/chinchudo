-- Unifica el canal creado por el fallback genérico del importador con el
-- nombre canónico usado por el seed y la interfaz.
DO $$
DECLARE
    canonical_channel_id TEXT;
    duplicate_channel_id TEXT;
BEGIN
    SELECT "id" INTO canonical_channel_id
    FROM "Channel"
    WHERE "name" = 'TikTok';

    SELECT "id" INTO duplicate_channel_id
    FROM "Channel"
    WHERE "name" = 'Tiktok';

    IF duplicate_channel_id IS NOT NULL THEN
        IF canonical_channel_id IS NULL THEN
            UPDATE "Channel"
            SET
                "name" = 'TikTok',
                "type" = 'short_video_comments',
                "baseUrl" = 'https://www.tiktok.com'
            WHERE "id" = duplicate_channel_id;
        ELSE
            UPDATE "Opportunity"
            SET "channelId" = canonical_channel_id
            WHERE "channelId" = duplicate_channel_id;

            DELETE FROM "Channel"
            WHERE "id" = duplicate_channel_id;
        END IF;
    END IF;
END $$;
