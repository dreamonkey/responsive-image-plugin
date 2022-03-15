import { describe, expect, it } from '@jest/globals';
import { parseProperties } from '../src/parsing';

describe('parsing', () => {
  describe('parseProperties', () => {
    it('should parse one property', () => {
      const input = 'size=1.0';
      const expected = {
        size: {
          __default: '1.0',
        },
      };

      const result = parseProperties(input);

      expect(result).toEqual(expected);
    });

    it('should parse multiple properties', () => {
      const input = 'size=1.0;ratio=3:4';
      const expected = {
        size: {
          __default: '1.0',
        },
        ratio: {
          __default: '3:4',
        },
      };

      const result = parseProperties(input);

      expect(result).toEqual(expected);
    });

    it('should parse options when the viewport is not the default one', () => {
      const input = 'size=0.5{sm}';
      const expected = {
        size: {
          sm: '0.5',
        },
      };

      const result = parseProperties(input);

      expect(result).toEqual(expected);
    });

    it('should parse options when multiple viewports are provided', () => {
      const input = 'size=0.5{sm|lg}';
      const expected = {
        size: {
          sm: '0.5',
          lg: '0.5',
        },
      };

      const result = parseProperties(input);

      expect(result).toEqual(expected);
    });

    it('should parse multiple options of same property', () => {
      const input = 'size=1.0,0.5{sm}';
      const expected = {
        size: {
          __default: '1.0',
          sm: '0.5',
        },
      };

      const result = parseProperties(input);

      expect(result).toEqual(expected);
    });

    it('should error when input is malformed', () => {
      const input1 = 'size=0.5{sm,md}';
      const input2 = 'ratio:3_4';
      const input3 = 'sm';

      expect(() => parseProperties(input1)).toThrow();
      expect(() => parseProperties(input2)).toThrow();
      expect(() => parseProperties(input3)).toThrow();
    });
  });
});
