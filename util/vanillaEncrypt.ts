export function encrypt(text: string, key: string) {
  return Array.from(text)
    .map((char, index) =>
      (char.charCodeAt(0) ^ key.charCodeAt(index % key.length))
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

export function decrypt(encryptedText: string, key: string) {
  const matches = encryptedText.match(/.{2}/g);
  if (!matches) return "";
  return matches
    .map((hex, index) =>
      String.fromCharCode(
        parseInt(hex, 16) ^ key.charCodeAt(index % key.length)
      )
    )
    .join("");
}

// // Example Usage
// const originalText = "Hello, World!";
// const encryptionKey = "mysecretkey";

// const encryptedText = encrypt(originalText, encryptionKey);
// console.log("Encrypted Text:", encryptedText);

// const decryptedText = decrypt(encryptedText, encryptionKey);
// console.log("Decrypted Text:", decryptedText);
