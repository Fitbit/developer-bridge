enum CloseCode {
  // These codes are specified by the RFC
  // https://tools.ietf.org/html/rfc6455#section-7.4.1
  GoingAway = 1001,
  PolicyViolation = 1008,
}

export default CloseCode;
