-- AI Call Center - Multi-tenant Database Schema
-- This file contains the SQL to create the necessary tables for multi-tenant support

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add routing_strategy to profiles table if it doesn't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS routing_strategy TEXT DEFAULT 'single_number_ivr';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS call_recording_enabled BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS transcription_enabled BOOLEAN DEFAULT true;

-- Create ai_agents table if it doesn't exist
CREATE TABLE IF NOT EXISTS ai_agents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    agent_type TEXT NOT NULL, -- 'customer_service', 'sales', 'support', 'appointment_booking', 'survey', 'after_hours', 'general'
    voice_name TEXT DEFAULT 'Puck', -- 'Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr'
    language_code TEXT DEFAULT 'en-US',
    system_instruction TEXT,
    greeting TEXT,
    twilio_phone_number TEXT,
    twilio_webhook_url TEXT,
    is_active BOOLEAN DEFAULT true,
    max_concurrent_calls INTEGER DEFAULT 5,
    business_hours_start TEXT,
    business_hours_end TEXT,
    business_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 0=Sunday, 1=Monday, etc.
    timezone TEXT DEFAULT 'America/New_York',
    escalation_enabled BOOLEAN DEFAULT false,
    escalation_type TEXT, -- 'human_agent', 'supervisor', 'voicemail', 'callback'
    escalation_phone_number TEXT,
    escalation_email TEXT,
    status TEXT DEFAULT 'available', -- 'available', 'busy', 'offline'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create phone_numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    friendly_name TEXT,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    twilio_sid TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ivr_menus table
CREATE TABLE IF NOT EXISTS ivr_menus (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    greeting_text TEXT NOT NULL,
    timeout_seconds INTEGER DEFAULT 10,
    max_attempts INTEGER DEFAULT 3,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ivr_options table
CREATE TABLE IF NOT EXISTS ivr_options (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ivr_menu_id UUID REFERENCES ivr_menus(id) ON DELETE CASCADE,
    digit TEXT NOT NULL,
    description TEXT NOT NULL,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    action_type TEXT DEFAULT 'agent', -- 'agent', 'transfer', 'voicemail', etc.
    action_data JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create external_integrations table
CREATE TABLE IF NOT EXISTS external_integrations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL, -- 'sip', 'extension', 'forwarding', etc.
    configuration JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create call_sessions table for tracking active calls
CREATE TABLE IF NOT EXISTS call_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    call_sid TEXT NOT NULL UNIQUE,
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
    phone_number_from TEXT,
    phone_number_to TEXT,
    session_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours')
);

-- Update call_logs table if it exists
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS call_sid TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS phone_number_from TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS phone_number_to TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS sentiment_score FLOAT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN DEFAULT false;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Enable Row Level Security
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivr_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivr_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own AI agents" ON ai_agents FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own AI agents" ON ai_agents FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own AI agents" ON ai_agents FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own AI agents" ON ai_agents FOR DELETE USING (profile_id = auth.uid());

CREATE POLICY "Users can view own phone numbers" ON phone_numbers FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own phone numbers" ON phone_numbers FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own phone numbers" ON phone_numbers FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own phone numbers" ON phone_numbers FOR DELETE USING (profile_id = auth.uid());

CREATE POLICY "Users can view own IVR menus" ON ivr_menus FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own IVR menus" ON ivr_menus FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own IVR menus" ON ivr_menus FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own IVR menus" ON ivr_menus FOR DELETE USING (profile_id = auth.uid());

CREATE POLICY "Users can view own IVR options" ON ivr_options FOR SELECT USING (ivr_menu_id IN (SELECT id FROM ivr_menus WHERE profile_id = auth.uid()));
CREATE POLICY "Users can insert own IVR options" ON ivr_options FOR INSERT WITH CHECK (ivr_menu_id IN (SELECT id FROM ivr_menus WHERE profile_id = auth.uid()));
CREATE POLICY "Users can update own IVR options" ON ivr_options FOR UPDATE USING (ivr_menu_id IN (SELECT id FROM ivr_menus WHERE profile_id = auth.uid()));
CREATE POLICY "Users can delete own IVR options" ON ivr_options FOR DELETE USING (ivr_menu_id IN (SELECT id FROM ivr_menus WHERE profile_id = auth.uid()));

CREATE POLICY "Users can view own external integrations" ON external_integrations FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own external integrations" ON external_integrations FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own external integrations" ON external_integrations FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own external integrations" ON external_integrations FOR DELETE USING (profile_id = auth.uid());

CREATE POLICY "Users can view own call sessions" ON call_sessions FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "Users can insert own call sessions" ON call_sessions FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "Users can update own call sessions" ON call_sessions FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "Users can delete own call sessions" ON call_sessions FOR DELETE USING (profile_id = auth.uid());

-- Create function to clean up expired call sessions
CREATE OR REPLACE FUNCTION cleanup_expired_call_sessions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM call_sessions WHERE expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to clean up expired call sessions
DROP TRIGGER IF EXISTS trigger_cleanup_expired_call_sessions ON call_sessions;
CREATE TRIGGER trigger_cleanup_expired_call_sessions
  AFTER INSERT ON call_sessions
  EXECUTE FUNCTION cleanup_expired_call_sessions();

-- Create function to increment minutes used
CREATE OR REPLACE FUNCTION increment_minutes_used(p_profile_id UUID, p_minutes INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles
  SET minutes_used = minutes_used + p_minutes
  WHERE id = p_profile_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_agents_profile_id ON ai_agents(profile_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_profile_id ON phone_numbers(profile_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_phone_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_ivr_menus_profile_id ON ivr_menus(profile_id);
CREATE INDEX IF NOT EXISTS idx_ivr_options_ivr_menu_id ON ivr_options(ivr_menu_id);
CREATE INDEX IF NOT EXISTS idx_external_integrations_profile_id ON external_integrations(profile_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_call_sid ON call_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_call_sessions_profile_id ON call_sessions(profile_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_profile_id ON call_logs(profile_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_agent_id ON call_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON call_logs(call_sid);