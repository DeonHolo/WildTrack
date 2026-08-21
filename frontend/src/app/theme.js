import { Button, InputBase, Modal, NativeSelect, Paper, PasswordInput, SegmentedControl, Textarea, TextInput, createTheme } from '@mantine/core';

export const wildTrackTheme = createTheme({
  primaryColor: 'wildtrackMaroon',
  primaryShade: 7,
  colors: {
    wildtrackMaroon: [
      '#fff0f3',
      '#f8dfe5',
      '#edbdc9',
      '#df98aa',
      '#d57890',
      '#cf637e',
      '#cc5875',
      '#65152e',
      '#561126',
      '#481020'
    ],
    wildtrackGold: [
      '#fff9e6',
      '#f8edc4',
      '#eedb91',
      '#e2c75c',
      '#d7b637',
      '#c89518',
      '#ad7e0d',
      '#8f6808',
      '#755400',
      '#5f4400'
    ]
  },
  fontFamily: 'Manrope Variable, Manrope, Arial, sans-serif',
  fontFamilyMonospace: 'IBM Plex Mono, Consolas, monospace',
  headings: {
    fontFamily: 'Manrope Variable, Manrope, Arial, sans-serif',
    fontWeight: '700'
  },
  defaultRadius: 'sm',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px'
  },
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem'
  },
  components: {
    Button: Button.extend({
      defaultProps: { radius: 'sm' },
      styles: { label: { letterSpacing: 0 } }
    }),
    InputBase: InputBase.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { letterSpacing: 0 } }
    }),
    TextInput: TextInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { letterSpacing: 0 } }
    }),
    Textarea: Textarea.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { letterSpacing: 0 } }
    }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { letterSpacing: 0 } }
    }),
    NativeSelect: NativeSelect.extend({
      defaultProps: { radius: 'sm' },
      styles: { input: { letterSpacing: 0 } }
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'sm', color: 'wildtrackMaroon' }
    }),
    Modal: Modal.extend({
      defaultProps: { radius: 'md', overlayProps: { backgroundOpacity: 0.46, blur: 1 } }
    }),
    Paper: Paper.extend({
      defaultProps: { radius: 'md' }
    })
  }
});
