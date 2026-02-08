import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { NotesColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { validateRegistration, RegistrationValidationResult } from '@/utils/validation';

type AuthMode = 'login' | 'register';

export default function AuthScreen() {
  const router = useRouter();
  const { login, register, signInWithProvider, resetPassword, devLogin, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isProviderLoading, setIsProviderLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<RegistrationValidationResult['errors']>({});

  const handleSubmit = async () => {
    // Clear previous validation errors
    setValidationErrors({});

    // Basic validation for login
    if (mode === 'login') {
      if (!email.trim() || !password.trim()) {
        Alert.alert('Error', 'Please fill in all fields');
        return;
      }

      const result = await login(email.trim(), password);
      if (result.success) {
        router.replace('/(tabs)');
      } else {
        Alert.alert(
          'Error',
          result.error || 'Invalid email or password. Please try again.'
        );
      }
      return;
    }

    // Full validation for registration
    const validation = validateRegistration({
      email: email.trim(),
      password,
      confirmPassword,
      fullName: name.trim(),
    });

    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      // Show first error in alert
      const firstError = Object.values(validation.errors)[0];
      Alert.alert('Validation Error', firstError || 'Please fix the errors and try again.');
      return;
    }

    const result = await register(email.trim(), password, name.trim());
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      Alert.alert(
        'Error',
        result.error || 'Registration failed. Please try again.'
      );
    }
  };

  const toggleMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setValidationErrors({});
  };

  const handleProviderSignIn = async (provider: 'apple' | 'google' | 'azure') => {
    setIsProviderLoading(true);
    const result = await signInWithProvider(provider);
    setIsProviderLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else if (result.error && result.error !== 'Sign-in cancelled') {
      Alert.alert('Error', result.error);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Please enter your email to reset your password.');
      return;
    }
    const result = await resetPassword(email.trim());
    if (result.success) {
      Alert.alert('Check your email', 'Password reset link sent.');
    } else {
      Alert.alert('Error', result.error || 'Failed to send reset email.');
    }
  };

  const handleDevLogin = async () => {
    const result = await devLogin();
    if (result.success) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('Dev Login Error', result.error || 'Dev login failed.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header spacer */}
        <View style={styles.header} />

        {/* Logo/Title */}
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="mic" size={48} color={NotesColors.primary} />
          </View>
          <Text style={styles.appName}>Glide</Text>
          <Text style={styles.subtitle}>Stream Your Consciousness</Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          <View style={styles.form}>
          {mode === 'register' && (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="person-outline" size={20} color={NotesColors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor={NotesColors.textSecondary}
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    if (validationErrors.fullName) {
                      setValidationErrors({ ...validationErrors, fullName: undefined });
                    }
                  }}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
              </View>
              {validationErrors.fullName && (
                <Text style={styles.errorText}>{validationErrors.fullName}</Text>
              )}
            </>
          )}

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={20} color={NotesColors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={NotesColors.textSecondary}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (validationErrors.email) {
                  setValidationErrors({ ...validationErrors, email: undefined });
                }
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {validationErrors.email && (
            <Text style={styles.errorText}>{validationErrors.email}</Text>
          )}

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={20} color={NotesColors.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={NotesColors.textSecondary}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                // Clear confirm password error if password changes
                if (validationErrors.confirmPassword) {
                  setValidationErrors({ ...validationErrors, confirmPassword: undefined });
                }
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={NotesColors.textSecondary}
              />
            </TouchableOpacity>
          </View>
          {validationErrors.password && (
            <Text style={styles.errorText}>{validationErrors.password}</Text>
          )}

          {mode === 'register' && (
            <>
              <View style={styles.inputContainer}>
                <Ionicons name="lock-closed-outline" size={20} color={NotesColors.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor={NotesColors.textSecondary}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    // Clear error when user starts typing
                    if (validationErrors.confirmPassword) {
                      setValidationErrors({ ...validationErrors, confirmPassword: undefined });
                    }
                  }}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={NotesColors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
              {validationErrors.confirmPassword && (
                <Text style={styles.errorText}>{validationErrors.confirmPassword}</Text>
              )}
            </>
          )}

          <TouchableOpacity
            style={[
              styles.submitButton,
              isLoading && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={NotesColors.textPrimary} />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && (
            <TouchableOpacity style={styles.forgotButton} onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}
          </View>
        </View>

        {/* Social Sign In */}
        <View style={styles.socialContainer}>
          <View style={styles.socialButtons}>
            <TouchableOpacity
              style={styles.providerButton}
              onPress={() => handleProviderSignIn('apple')}
              disabled={isProviderLoading}
            >
              <Ionicons name="logo-apple" size={18} color={NotesColors.textPrimary} />
              <Text style={styles.providerText}>Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.providerButton}
              onPress={() => handleProviderSignIn('google')}
              disabled={isProviderLoading}
            >
              <Ionicons name="logo-google" size={18} color={NotesColors.textPrimary} />
              <Text style={styles.providerText}>Google</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.providerButton}
              onPress={() => handleProviderSignIn('azure')}
              disabled={isProviderLoading}
            >
              <Ionicons name="logo-windows" size={18} color={NotesColors.textPrimary} />
              <Text style={styles.providerText}>Microsoft</Text>
            </TouchableOpacity>
            {isProviderLoading && (
              <View style={styles.appleLoadingOverlay}>
                <ActivityIndicator color={NotesColors.primary} />
              </View>
            )}
          </View>
        </View>

        {__DEV__ && (
          <View style={styles.devLoginContainer}>
            <TouchableOpacity style={styles.devLoginButton} onPress={handleDevLogin}>
              <Text style={styles.devLoginText}>Dev Login</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Toggle Mode */}
        <View style={styles.toggleBar}>
          <Text style={styles.toggleText}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </Text>
          <TouchableOpacity onPress={toggleMode} style={styles.toggleButton}>
            <Text style={styles.toggleLink}>
              {mode === 'login' ? 'Sign Up' : 'Sign In'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: NotesColors.background,
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 16,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(98, 69, 135, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: NotesColors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    color: NotesColors.textSecondary,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 18,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  formCard: {
    backgroundColor: NotesColors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: NotesColors.border,
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: NotesColors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: NotesColors.border,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: NotesColors.textPrimary,
  },
  eyeButton: {
    padding: 8,
  },
  submitButton: {
    backgroundColor: NotesColors.primary,
    borderRadius: 12,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  forgotButton: {
    alignSelf: 'center',
    padding: 8,
  },
  forgotText: {
    fontSize: 14,
    color: NotesColors.primary,
  },
  socialContainer: {
    marginTop: 20,
  },
  devLoginContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  devLoginButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: NotesColors.border,
    backgroundColor: NotesColors.card,
  },
  devLoginText: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textSecondary,
  },
  socialButtons: {
    flexDirection: 'row',
    gap: 10,
    position: 'relative',
  },
  providerButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NotesColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: NotesColors.card,
    flexDirection: 'row',
  },
  providerText: {
    fontSize: 15,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  appleLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  toggleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: NotesColors.card,
    borderWidth: 1,
    borderColor: NotesColors.border,
  },
  toggleText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: NotesColors.primary,
  },
  toggleLink: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.textPrimary,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: -8,
    marginBottom: 4,
    marginLeft: 16,
  },
});
