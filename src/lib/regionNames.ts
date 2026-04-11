const regionDisplayNames =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function getCountryNameByCode(countryCode: string) {
  const normalizedCode = countryCode.trim().toUpperCase();

  if (!normalizedCode) {
    return "";
  }

  return regionDisplayNames?.of(normalizedCode) ?? normalizedCode;
}