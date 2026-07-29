export function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="mt-1.5 text-[13px] text-danger">
      {message}
    </p>
  );
}
