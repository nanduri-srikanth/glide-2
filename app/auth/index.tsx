import React, { useState, useEffect } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { NotesColors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { validateRegistration, RegistrationValidationResult } from '@/utils/validation';
import { RateLimitStatus, checkRateLimit } from '@/utils/rateLimit';

type AuthMode = 'login' | 'register';

export default function AuthScreen() {
  const router = useRouter();
  const { login, register, signInWithApple, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<RegistrationValidationResult['errors']>({});
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);
  const [remainingTime, setRemainingTime] = useState(0);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAuthAvailable);
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (!rateLimitStatus?.isLockedOut || remainingTime <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          // Lockout expired, check status
          checkRateLimit(email).then(setRateLimitStatus);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitStatus, remainingTime, email]);

  // Check rate limit when email changes
  useEffect(() => {
    if (mode === 'login' && email) {
      checkRateLimit(email).then(status => {
        setRateLimitStatus(status);
        if (status.isLockedOut) {
          setRemainingTime(status.lockoutRemainingSeconds);
        }
      });
    }
  }, [email, mode]);

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
        // Update rate limit status from result
        if (result.rateLimitStatus) {
          setRateLimitStatus(result.rateLimitStatus);
          if (result.rateLimitStatus.isLockedOut) {
            setRemainingTime(result.rateLimitStatus.lockoutRemainingSeconds);
          }
        }

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

  const handleAppleSignIn = async () => {
    setIsAppleLoading(true);
    const result = await signInWithApple();
    setIsAppleLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else if (result.error && result.error !== 'Sign-In was cancelled') {
      Alert.alert('Error', result.error);
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
          <Text style={styles.tagline}>Voice notes, powered by AI</Text>
        </View>

        {/* Rate Limit Lockout Warning */}
        {mode === 'login' && rateLimitStatus?.isLockedOut && (
          <View style={styles.lockoutWarning}>
            <Ionicons name="lock-closed" size={24} color="#EF4444" />
            <View style={styles.lockoutContent}>
              <Text style={styles.lockoutTitle}>Account Temporarily Locked</Text>
              <Text style={styles.lockoutMessage}>
                Too many failed login attempts. Please wait for the lockout to expire.
              </Text>
              <Text style={styles.lockoutTimer}>
                Time remaining: {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}
              </Text>
            </View>
          </View>
        )}

        {/* Remaining Attempts Warning */}
        {mode === 'login' && !rateLimitStatus?.isLockedOut && rateLimitStatus && rateLimitStatus.remainingAttempts < 3 && (
          <View style={styles.attemptsWarning}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={styles.attemptsText}>
              {rateLimitStatus.remainingAttempts} attempt{rateLimitStatus.remainingAttempts !== 1 ? 's' : ''} remaining
            </Text>
          </View>
        )}

        {/* Form */}
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
              (isLoading || (mode === 'login' && rateLimitStatus?.isLockedOut)) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={isLoading || (mode === 'login' && rateLimitStatus?.isLockedOut)}
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
            <TouchableOpacity style={styles.forgotButton}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Social Sign In */}
        <View style={styles.socialContainer}>
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialButtons}>
            {appleAuthAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={12}
                style={styles.appleButton}
                onPress={handleAppleSignIn}
              />
            )}
            {isAppleLoading && (
              <View style={styles.appleLoadingOverlay}>
                <ActivityIndicator color={NotesColors.primary} />
              </View>
            )}
          </View>
        </View>

        {/* Toggle Mode */}
        <View style={styles.toggleContainer}>
          <Text style={styles.toggleText}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </Text>
          <TouchableOpacity onPress={toggleMode}>
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
    marginBottom: 40,
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
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: NotesColors.textSecondary,
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
    height: 56,
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
    marginTop: 32,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: NotesColors.textSecondary,
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  socialButtons: {
    alignItems: 'center',
    position: 'relative',
  },
  appleButton: {
    width: '100%',
    height: 56,
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
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
    marginBottom: 24,
    gap: 4,
  },
  toggleText: {
    fontSize: 14,
    color: NotesColors.textSecondary,
  },
  toggleLink: {
    fontSize: 14,
    fontWeight: '600',
    color: NotesColors.primary,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: -8,
    marginBottom: 4,
    marginLeft: 16,
  },
  lockoutWarning: {
    flexDirection: 'row',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  lockoutContent: {
    flex: 1,
    marginLeft: 12,
  },
  lockoutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 4,
  },
  lockoutMessage: {
    fontSize: 14,
    color: '#7F1D1D',
    marginBottom: 8,
  },
  lockoutTimer: {
    fontSize: 18,
    fontWeight: '700',
    color: '#DC2626',
  },
  attemptsWarning: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  attemptsText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
});
