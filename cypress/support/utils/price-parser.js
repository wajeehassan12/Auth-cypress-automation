/**
 * Parses numeric price strings supporting EU ("45.076,98") and US ("45,076.97") conventions.
 * Automatically sanitizes currency symbols, letters, and spaces before parsing.
 */
export function parseLocaleNumber(raw) {
    if (!raw) return NaN;
    let str = String(raw).trim();

    // Strip away currency symbols, minus signs, letters, and spaces
    str = str.replace(/[^0-9.,]/g, '');

    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');

    if (lastComma !== -1 && lastDot !== -1) {
        if (lastComma > lastDot) {
            // EU style: 45.076,98 -> 45076.98
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // US style: 45,076.97 -> 45076.97
            str = str.replace(/,/g, '');
        }
    } else if (lastComma !== -1) {
        const decimals = str.length - lastComma - 1;
        str = decimals === 2 ? str.replace(',', '.') : str.replace(/,/g, '');
    } else if (lastDot !== -1) {
        const decimals = str.length - lastDot - 1;
        str = decimals === 2 ? str : str.replace(/\./g, '');
    }

    return parseFloat(str);
}