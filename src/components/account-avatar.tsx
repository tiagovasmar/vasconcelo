/**
 * Avatar de «Mi cuenta»: una persona sobre fondo dorado con un rayo (detalle de tipo eléctrico). Es un dibujo ORIGINAL en SVG, hecho para la tienda:
 * el proyecto no tiene ninguna imagen de Pikachu con permiso de uso, así que no se reproduce el personaje. Si el dueño aporta una imagen propia o con
 * licencia, se reemplaza este componente. Es decorativo (`aria-hidden`): el nombre accesible lo da el enlace.
 */
export function AccountAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={32} height={32} aria-hidden="true" focusable="false" className={className}>
      <circle cx="16" cy="16" r="15" fill="#d4b872" stroke="#121715" strokeWidth="1.6" />
      <circle cx="16" cy="12.5" r="4.6" fill="#121715" />
      <path d="M6.6 26.2c.9-5 4.4-7.6 9.4-7.6s8.5 2.6 9.4 7.6a14.4 14.4 0 0 1-18.8 0z" fill="#121715" />
      <path d="M24.4 3.8 19.6 11h3.2l-2.6 6.4 6.4-8h-3.4z" fill="#fff6c9" stroke="#121715" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}
