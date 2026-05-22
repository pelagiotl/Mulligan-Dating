import { Linking } from 'react-native';

export const SUPPORT_EMAIL = 'Mulligandating@gmail.com';

const CREATE_PROFILE_SUPPORT_SUBJECT = 'Mulligan — help creating my profile';

export function getCreateProfileSupportMailtoUrl(): string {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(CREATE_PROFILE_SUPPORT_SUBJECT)}`;
}

export function openCreateProfileSupportEmail(): void {
  void Linking.openURL(getCreateProfileSupportMailtoUrl());
}
