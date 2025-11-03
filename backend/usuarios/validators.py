import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

class ComplexityValidator:
    """
    Exige pelo menos: 1 maiúscula, 1 minúscula, 1 dígito e 1 símbolo.
    """
    def validate(self, password, user=None):
        if not re.search(r"[A-Z]", password or ""):
            raise ValidationError(_("A senha deve conter ao menos uma letra maiúscula."))
        if not re.search(r"[a-z]", password or ""):
            raise ValidationError(_("A senha deve conter ao menos uma letra minúscula."))
        if not re.search(r"\d", password or ""):
            raise ValidationError(_("A senha deve conter ao menos um dígito."))
        if not re.search(r"[^\w\s]", password or ""):
            raise ValidationError(_("A senha deve conter ao menos um símbolo."))

    def get_help_text(self):
        return _("Mínimo 10 caracteres, com maiúscula, minúscula, dígito e símbolo.")
