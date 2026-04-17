import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr(null);
    setLoading(true);
    try {
      const { data, error } =
        mode === 'signin'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      console.log('[auth]', mode, { user: data?.user?.id, error: error?.message });
      if (error) setErr(error.message);
      else if (!data?.session) setErr('No session returned. Check email for confirmation link.');
    } catch (e) {
      console.error('[auth] threw', e);
      setErr(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{
        flex: 1,
        backgroundColor: '#f8f7ff',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          padding: 28,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 6,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: '#1a1a2e' }}>
            <Text style={{ color: '#8b5cf6' }}>⚡ </Text>Get-it-done
          </Text>
          <Text style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            Track tasks. Time work. Get it done.
          </Text>
        </View>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={{
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            marginBottom: 10,
          }}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor="#aaa"
          secureTextEntry
          style={{
            borderWidth: 1.5,
            borderColor: '#e5e7eb',
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 14,
            marginBottom: 10,
          }}
        />
        {err && (
          <Text style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>
            {err}
          </Text>
        )}
        <Pressable
          onPress={handle}
          disabled={loading || !email || !password}
          style={{
            backgroundColor: loading || !email || !password ? '#c4b5fd' : '#8b5cf6',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>
        <Pressable
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          style={{ marginTop: 14 }}
        >
          <Text style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
